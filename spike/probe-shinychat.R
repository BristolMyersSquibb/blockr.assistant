# Spike probe (shinychat server in the loop):
# Same commit-tool mechanism, but the real turn is driven through
# shinychat::chat_server -- its ExtendedTask + stream_async path -- not a bare
# chat_async. Simulates the browser's `_user_input` submit, then pumps the
# reactive + later loops and reads back the client's turns.

library(shiny)
library(ellmer)
library(promises)
library(later)

# Shared closures the module writes into, read after the turn.
env <- new.env()
env$saw_postflush <- NA_character_
env$events <- character()

asst <- function(id) {
  moduleServer(id, function(input, output, session) {

    trigger <- reactiveVal(0L)
    staged  <- reactiveVal(NULL)

    block_result <- reactive({
      if (is.null(staged())) "no block yet"
      else sprintf("block '%s': ROWCOUNT=%d", staged(), 4000L + 173L * trigger())
    })

    log_ev <- function(...) env$events <- c(env$events, sprintf(...))

    add_block <- ellmer::tool(
      function(id) {
        staged(id)
        log_ev("add_block(%s) staged", id)
        sprintf("Staged '%s'. Call commit to apply and see its result.", id)
      },
      name = "add_block",
      description = "Stage a new block. Not evaluated yet.",
      arguments = list(id = ellmer::type_string("Block id."))
    )

    commit <- ellmer::tool(
      function() {
        trigger(isolate(trigger()) + 1L)
        log_ev("commit() awaiting flush")
        promise(function(resolve, reject) {
          session$onFlushed(function() {
            val <- isolate(block_result())
            env$saw_postflush <- val
            log_ev("commit() onFlushed -> %s", val)
            resolve(paste0("Applied. Touched block result:\n", val))
          }, once = TRUE)
        })
      },
      name = "commit",
      description = "Apply staged changes atomically and return the touched block's result."
    )

    client <- ellmer::chat_anthropic(
      model = "claude-haiku-4-5-20251001",
      system_prompt = paste(
        "You build data pipelines. To add a block call add_block, then call",
        "commit exactly once to apply and observe. Then reply in ONE sentence",
        "stating the block's exact ROWCOUNT from the commit result."
      )
    )
    client$register_tool(add_block)
    client$register_tool(commit)

    # Drive the turn through the REAL shinychat server path.
    shinychat::chat_server("chat", client, session = session)

    env$client <- client
    NULL
  })
}

testServer(asst, {
  session$setInputs(`chat_user_input` = "Add block 'flt', then apply it and tell me its row count.")

  deadline <- 90; start <- Sys.time()
  repeat {
    session$flushReact(); later::run_now(0.2)
    turns <- tryCatch(env$client$get_turns(), error = function(e) list())
    last  <- if (length(turns)) turns[[length(turns)]] else NULL
    finished <- !is.null(last) && identical(last@role, "assistant") &&
      grepl("4173", tryCatch(last@text, error = function(e) ""), fixed = TRUE)
    if (finished) break
    if (as.numeric(Sys.time() - start, units = "secs") > deadline) {
      cat("TIMEOUT\n"); break
    }
  }
  session$flushReact(); later::run_now()

  turns <- env$client$get_turns()
  final <- turns[[length(turns)]]@text
  cat("=== EVENT LOG ===\n", paste(env$events, collapse = "\n"), "\n\n", sep = "")
  cat("saw_postflush :", env$saw_postflush, "\n")
  cat("final text    :", final, "\n\n")

  stopifnot(
    "commit tool never read post-flush state" =
      !is.na(env$saw_postflush) && grepl("ROWCOUNT=4173", env$saw_postflush, fixed = TRUE),
    "model final reply (via shinychat) did not echo post-flush rowcount" =
      grepl("4173", final, fixed = TRUE)
  )
  cat("SHINYCHAT PROBE: PASS -- commit tool delivered post-flush result in-band through shinychat::chat_server.\n")
})
