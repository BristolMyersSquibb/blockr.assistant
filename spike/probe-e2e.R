# Spike probe (end-to-end, REAL Anthropic chat):
# One running turn: model stages a block, calls an async `commit` tool that
# applies the staged change, AWAITS session$onFlushed, and returns the touched
# block's POST-FLUSH result as its own tool result. The result carries an
# unguessable token (ROWCOUNT=4173) that only exists after the flush -- if the
# model's final in-band reply echoes it, the commit tool delivered post-flush
# state mid-turn and the model consumed it, exactly as #73 proposes.

library(shiny)
library(ellmer)
library(promises)
library(later)

srv <- function(id) {
  moduleServer(id, function(input, output, session) {

    trigger <- reactiveVal(0L)
    staged  <- reactiveVal(NULL)

    # Stands in for a blockr block's server$result(): only reflects the staged
    # change AFTER a flush (trigger increments on commit).
    block_result <- reactive({
      if (is.null(staged())) {
        "no block yet"
      } else {
        sprintf("block '%s' evaluated: ROWCOUNT=%d", staged(), 4000L + 173L * trigger())
      }
    })

    events        <- reactiveVal(character())
    add_event     <- function(...) events(c(isolate(events()), sprintf(...)))
    saw_postflush <- reactiveVal(NA_character_)
    final_text    <- reactiveVal(NA_character_)
    done          <- reactiveVal(FALSE)
    errored       <- reactiveVal(NA_character_)

    add_block <- ellmer::tool(
      function(id) {
        staged(id)
        add_event("add_block(%s) -> staged (pre-flush result: %s)",
                  id, isolate(block_result()))
        sprintf("Staged block '%s'. Call commit to apply and see its result.", id)
      },
      name = "add_block",
      description = "Stage a new block on the board. Does not evaluate it yet.",
      arguments = list(id = ellmer::type_string("Identifier for the new block."))
    )

    commit <- ellmer::tool(
      function() {
        trigger(isolate(trigger()) + 1L)   # invalidate block_result; schedule flush
        add_event("commit() called; awaiting flush")

        promise(function(resolve, reject) {
          session$onFlushed(
            function() {
              val <- isolate(block_result())
              saw_postflush(val)
              add_event("commit() onFlushed: returning post-flush result: %s", val)
              resolve(
                paste0("Applied. Post-flush result of touched block:\n", val)
              )
            },
            once = TRUE
          )
        })
      },
      name = "commit",
      description = paste(
        "Apply all staged board changes atomically and return the touched",
        "block's freshly evaluated result. Call once after staging."
      )
    )

    chat <- ellmer::chat_anthropic(
      model = "claude-haiku-4-5-20251001",
      system_prompt = paste(
        "You build data pipelines on a board. To add a block: call add_block,",
        "then call commit exactly once to apply staged changes and observe the",
        "result. After commit returns, reply to the user in ONE sentence that",
        "states the block's exact ROWCOUNT from the commit result."
      )
    )
    chat$register_tool(add_block)
    chat$register_tool(commit)

    observeEvent(TRUE, once = TRUE, {
      add_event("turn start: chat_async invoked")
      chat$chat_async(
        "Add a block called 'flt' to the board, then apply it and tell me its row count."
      ) %...>% (function(txt) {
        final_text(txt)
        done(TRUE)
        add_event("turn end: final assistant text captured")
      }) %...!% (function(e) {
        errored(conditionMessage(e))
        done(TRUE)
      })
    })

    exportTestValues(
      done      = done(),
      final     = final_text(),
      postflush = saw_postflush(),
      err       = errored(),
      log       = paste(events(), collapse = "\n")
    )
  })
}

testServer(srv, {
  deadline <- 90
  start <- Sys.time()
  repeat {
    session$flushReact()
    later::run_now(0.2)
    if (isTRUE(isolate(done()))) break
    if (as.numeric(Sys.time() - start, units = "secs") > deadline) {
      cat("TIMEOUT after", deadline, "s\n"); break
    }
  }
  session$flushReact(); later::run_now()

  cat("=== EVENT LOG ===\n", isolate(paste(events(), collapse = "\n")), "\n\n", sep = "")
  cat("errored        :", isolate(errored()), "\n")
  cat("saw_postflush  :", isolate(saw_postflush()), "\n")
  cat("final text     :", isolate(final_text()), "\n\n")

  stopifnot(
    "chat turn did not complete" = isTRUE(isolate(done())),
    "chat errored" = is.na(isolate(errored())),
    "commit tool never read post-flush state" =
      !is.na(isolate(saw_postflush())) &&
      grepl("ROWCOUNT=4173", isolate(saw_postflush()), fixed = TRUE),
    "model final reply did not echo the post-flush rowcount (in-band delivery failed)" =
      grepl("4173", isolate(final_text()), fixed = TRUE)
  )
  cat("E2E PROBE: PASS -- post-flush result delivered in-band and consumed by the model in one turn.\n")
})
