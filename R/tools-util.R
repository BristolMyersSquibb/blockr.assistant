# A failure goes back as a tool result carrying `error` rather than as text,
# since the chat's tool card takes its status from `error` alone. The model
# reads the message behind ellmer's own "Tool calling failed with error", so
# the message carries no prefix of its own.
with_tool_errors <- function(expr) {

  tryCatch(
    expr,
    error = function(e) ellmer::ContentToolResult(error = conditionMessage(e))
  )
}

parse_args_json <- function(s, tool) {

  if (!nzchar(s)) {
    return(list())
  }

  # simplifyVector keeps scalar arrays atomic (by: ["x"] -> "x"), but
  # array-of-objects arguments (filter `conditions`, summarize `summaries`) must
  # stay lists of named records: simplifyDataFrame would collapse them into a
  # data.frame the blocks' state cannot consume -- silently empty, or a
  # $-on-atomic crash on the flat-argument blocks.
  parsed <- jsonlite::fromJSON(
    s,
    simplifyVector = TRUE,
    simplifyDataFrame = FALSE,
    simplifyMatrix = FALSE
  )

  if (is.null(parsed)) {
    return(list())
  }

  if (!is.list(parsed) ||
        (length(parsed) > 0L && is.null(names(parsed)))) {
    stop(
      glue::glue(
        "{tool} `args` must be a JSON object with named fields, e.g. ",
        "'{{\"n\": 10}}'. Got a JSON ",
        "{if (is.list(parsed)) 'array' else 'scalar or array'}."
      ),
      call. = FALSE
    )
  }

  parsed
}

compact <- function(x) {
  x[!vapply(x, is.null, logical(1L))]
}

nullify <- function(x) {

  if (length(x) == 0L) {
    return(NULL)
  }

  if (is.atomic(x) && length(x) == 1L && is.na(x)) {
    return(NULL)
  }

  x
}
