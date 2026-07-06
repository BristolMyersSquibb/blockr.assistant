tool_query_data <- function(board, update, session) {

  ellmer::tool(
    function(code) {
      with_tool_errors("query_data", {

        blks <- isolate(board$blocks)

        data <- list()
        skipped <- character()

        for (id in names(blks)) {

          res <- tryCatch(
            isolate(blks[[id]]$server$result()),
            error = function(e) e
          )

          if (inherits(res, "error")) {
            skipped <- c(skipped, id)
          } else {
            data[[id]] <- res
          }
        }

        env <- eval_env(data)
        parsed <- parse(text = code)

        output <- capture.output({
          val <- NULL
          for (e in parsed) {
            val <- eval(e, envir = env)
          }
          if (!is.null(val)) {
            print(val)
          }
        })

        if (length(output) > 200L) {
          hidden <- length(output) - 200L
          output <- c(
            output[seq_len(200L)],
            sprintf("(output truncated; %d lines hidden)", hidden)
          )
        }

        if (length(skipped)) {
          output <- c(
            sprintf(
              "(skipped blocks with errors: %s)",
              paste(skipped, collapse = ", ")
            ),
            "",
            output
          )
        }

        paste(output, collapse = "\n")
      })
    },
    name        = "query_data",
    description = paste(
      "Evaluate R code against the board's block results. Every",
      "committed block's evaluated result is bound in scope by its",
      "block id (e.g. for a block with id `data` write `head(data)`).",
      "Returns captured stdout plus the auto-printed value of the",
      "last expression -- the same shape an R REPL would produce.",
      "Use this for questions the Board section doesn't carry:",
      "unique values, group counts, ad-hoc filters, joins across",
      "blocks. Read-only; the board is not modified.",
      "\n\nA dm block's result is a `dm` object bound by its id (NOT its",
      "individual tables). Reach a table via `<id>$<table>` -- e.g. if",
      "the dm block id is `dm`, write `head(dm$adsl)` or",
      "`names(dm$adae)`, not bare `adsl`. To actually use a dm table in",
      "a chart/summary, add a dm_pull_block."
    ),
    arguments = list(
      code = ellmer::type_string(
        paste(
          "R code to evaluate. Multiple statements allowed; the",
          "last expression's value is auto-printed."
        )
      )
    )
  )
}
