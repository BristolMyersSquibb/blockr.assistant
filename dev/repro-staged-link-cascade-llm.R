# Same bug, but driven by the model, to see whether a real turn hits it.
# Minimal board (one dataset block), one message that asks for a build and
# then a replacement in the same turn. Every tool call and tool result is
# logged, so a rejected remove_block is visible in the transcript.
#
# Run: cd /tmp && EVAL_MODEL=gpt-5.4 Rscript \
#        /workspace/blockr.assistant/dev/repro-staged-link-cascade-llm.R

readRenviron("/workspace/.Renviron")
options(blockr.attach_default_packages = TRUE)

MODEL <- Sys.getenv("EVAL_MODEL", "gpt-5.4")

suppressPackageStartupMessages({
  library(shiny)
  pkgload::load_all("/workspace/blockr.core",      quiet = TRUE)
  pkgload::load_all("/workspace/blockr.dplyr",     quiet = TRUE)
  pkgload::load_all("/workspace/blockr.assistant", quiet = TRUE)
})
asst <- asNamespace("blockr.assistant")

# Two prompts. PROMPT=replace asks for a build-then-replace without
# constraining when to commit: the model usually just skips the first block,
# so the bug never fires. PROMPT=stage (default) keeps the retraction inside
# one staging unit, which is where the cascade gap actually lives.
PROMPTS <- list(

  replace = paste(
    "Wire a head block to the data block. On second thought, I'd rather have",
    "a filter block keeping rows with Sepal.Length > 5 in its place, so get",
    "rid of the head block again. When you are done the board must contain",
    "the data block and the filter block only."
  ),

  stage = paste(
    "Stage a head block wired to the data block, but do not commit yet.",
    "Then, still before committing, take that head block back out again and",
    "stage a filter block keeping rows with Sepal.Length > 5 in its place.",
    "Commit once, at the very end, so the board only ever sees the filter."
  )
)

PROMPT <- PROMPTS[[Sys.getenv("PROMPT", "stage")]]

seed <- new_board(blocks = c(data = new_dataset_block("iris")))

blockr.core::sink_msg(shiny::testServer(
  blockr.core::get_s3_method("board_server", seed),
  {
    session$flushReact()

    wrap <- new.env()
    makeActiveBinding("board",  function() rv$board,  wrap)
    makeActiveBinding("blocks", function() rv$blocks, wrap)
    wrap$conditions <- function() isolate(rv$conditions())

    pending_payload <- asst$empty_pending()
    pending <- function(x) {
      if (missing(x)) return(pending_payload)
      pending_payload <<- x
      invisible(pending_payload)
    }

    perform_commit <- function() {
      if (!asst$has_any_changes(pending())) {
        return("Nothing is staged. Stage changes with the mutation tools, then commit.")
      }
      payload <- pending()
      pending_payload <<- asst$empty_pending()
      touched <- asst$touched_blocks(payload, isolate(rv$board))
      payload$views <- NULL
      payload$extensions <- NULL
      baseline <- isolate(rv$conditions())
      board_update(payload)
      session$flushReact()
      out <- rv$last_update
      if (isFALSE(out$ok)) {
        return(asst$format_flush_feedback(out, header = asst$commit_reject_header()))
      }
      review <- asst$format_flush_feedback(
        list(ok = TRUE),
        asst$added_conditions(baseline, isolate(rv$conditions())),
        asst$collect_touched_results(touched, wrap),
        header = asst$commit_header()
      )
      if (is.null(review)) asst$commit_clean_note() else review
    }

    cl <- ellmer::chat_openai(model = MODEL, echo = "none")
    asst$register_read_tools(cl, wrap, function(p) invisible(NULL), NULL)
    asst$register_mutation_tools(cl, wrap, pending, NULL)
    asst$register_commit_tool(cl, perform_commit)
    cl$set_system_prompt(
      blockr.assistant::default_system_prompt(wrap, cl, function() NULL)
    )

    cat("model :", MODEL, "\n")
    cat("prompt:", PROMPT, "\n\n")

    reply <- cl$chat(PROMPT)

    # ---- transcript: every tool call with its result ----------------------
    cat("===== TOOL TRANSCRIPT =====\n")
    rejected <- 0L
    for (trn in cl$get_turns()) {
      for (ct in trn@contents) {
        cls <- class(ct)[1L]
        if (cls == "ellmer::ContentToolRequest") {
          args <- tryCatch(
            paste(names(ct@arguments), unlist(lapply(ct@arguments, function(a)
              paste(utils::head(as.character(a), 3L), collapse = "/"))),
              sep = "=", collapse = ", "),
            error = function(e) ""
          )
          cat(sprintf("CALL  %s(%s)\n", ct@name, substr(args, 1L, 120L)))
        }
        if (cls == "ellmer::ContentToolResult") {
          v <- if (is.null(ct@value)) ct@error else ct@value
          s <- gsub("\\s+", " ", paste(as.character(v), collapse = " "))
          if (grepl("failed:|REJECT|Expecting all links", s)) {
            rejected <- rejected + 1L
            cat(sprintf("  !!  %s\n", substr(s, 1L, 200L)))
          } else {
            cat(sprintf("  ->  %s\n", substr(s, 1L, 100L)))
          }
        }
      }
    }

    cat("\n===== FINAL BOARD =====\n")
    blks <- board_blocks(isolate(rv$board))
    lnks <- as.data.frame(board_links(isolate(rv$board)))
    cat("blocks:", toString(sprintf("%s(%s)", names(blks),
        vapply(blks, function(b) sub("_block$", "", class(b)[1L]), character(1L)))), "\n")
    cat("links :", if (nrow(lnks)) toString(sprintf("%s->%s", lnks$from, lnks$to)) else "(none)", "\n")
    cat("rejected tool calls:", rejected, "\n")
    cat("\nreply:", reply, "\n")
  },
  args = list(x = seed)
))
