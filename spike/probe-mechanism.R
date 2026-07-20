# Spike probe (Risk 3, deterministic, no LLM):
# Prove that a tool returning a promise which resolves on session$onFlushed is
# awaited with the correct POST-FLUSH reactive state, when driven inside the
# same shiny::ExtendedTask async context shinychat uses. Models a blockr board:
# `commit()` applies a staged change, invalidates a downstream "block result"
# reactive (schedules a flush), and must return that block's value only AFTER
# the flush -- exactly what the #73 commit tool needs.

library(shiny)
library(promises)
library(later)

srv <- function(id) {
  moduleServer(id, function(input, output, session) {

    trigger <- reactiveVal(0L)
    staged  <- reactiveVal("<none>")

    # Stands in for a block's server$result(): recomputes on every flush after
    # the staged value / trigger change.
    block_result <- reactive({
      sprintf("evaluated[gen=%d, arg=%s]", trigger(), staged())
    })

    log <- reactiveVal(character())
    add_log <- function(...) log(c(isolate(log()), sprintf(...)))

    pre_flush_read  <- reactiveVal(NA_character_)
    post_flush_read <- reactiveVal(NA_character_)
    resolved        <- reactiveVal(FALSE)

    # The candidate commit-tool body: stage -> invalidate -> await flush -> read.
    commit_tool <- function(arg) {
      staged(arg)
      trigger(isolate(trigger()) + 1L)   # invalidate block_result; schedules flush
      add_log("commit: staged=%s, trigger bumped to %d", arg, isolate(trigger()))

      # A read *now* (before yielding) sees stale/invalidated state.
      pre_flush_read(
        isolate(tryCatch(block_result(), error = function(e) paste("ERR:", conditionMessage(e))))
      )

      promise(function(resolve, reject) {
        session$onFlushed(
          function() {
            val <- isolate(block_result())
            add_log("onFlushed fired; block_result=%s", val)
            resolve(val)
          },
          once = TRUE
        )
      })
    }

    # Drive it exactly as shinychat does: an ExtendedTask whose worker returns a
    # promise ellmer would `await()`. We chain the tool result the same way.
    task <- ExtendedTask$new(function() {
      commit_tool("HELLO") %...>% (function(v) {
        post_flush_read(v)
        resolved(TRUE)
        add_log("tool result received in-band: %s", v)
      })
    })

    observeEvent(TRUE, once = TRUE, {
      add_log("invoking ExtendedTask (turn start)")
      task$invoke()
    })

    exportTestValues(
      pre  = pre_flush_read(),
      post = post_flush_read(),
      done = resolved(),
      logs = paste(log(), collapse = "\n")
    )
  })
}

testServer(srv, {
  # Pump the reactive + later loops the way a live app's main loop would.
  for (i in seq_len(30)) {
    session$flushReact()
    later::run_now()
    if (isTRUE(isolate(resolved()))) break
  }
  session$flushReact(); later::run_now()

  cat("=== LOG ===\n", isolate(paste(log(), collapse = "\n")), "\n\n", sep = "")
  cat("resolved (in-band result received):", isolate(resolved()), "\n")
  cat("pre-flush read  :", isolate(pre_flush_read()), "\n")
  cat("post-flush read :", isolate(post_flush_read()), "\n")

  stopifnot(
    "tool promise never resolved (deadlock/onFlushed never fired)" =
      isTRUE(isolate(resolved())),
    "post-flush value is not the freshly evaluated result" =
      isolate(post_flush_read()) == "evaluated[gen=1, arg=HELLO]"
  )
  cat("\nMECHANISM PROBE: PASS\n")
})
