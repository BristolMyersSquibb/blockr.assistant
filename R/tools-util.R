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

# Every tool hands ellmer a plain string. Left to ellmer, a list or data.frame
# result is converted to JSON for us, which ellmer 0.5.0 deprecates, and the
# JSON-object tool content it then sends is rejected (HTTP 400) by stricter
# OpenAI-compatible gateways. A `json`-classed string, ellmer's suggested
# replacement, goes out as that same JSON-object content, so the class is
# dropped as well and only a bare character vector goes out as text. The
# encoding is the one ellmer applied itself, so the model reads the same
# payload as before. Wrapping at registration rather
# than in each `ellmer::tool()` also covers the typed pool and the deployment's
# own tools. A `ToolDef` is a closure carrying its props as attributes, so the
# wrapper takes them over as is.
as_text_tool <- function(tool) {

  res <- function(...) tool_result_text(tool(...))
  attributes(res) <- attributes(tool)

  res
}

tool_result_text <- function(x) {

  if (promises::is.promise(x)) {
    return(promises::then(x, tool_result_text))
  }

  if (inherits(x, "ellmer::ContentToolResult")) {
    return(x)
  }

  if (!is.character(x)) {
    x <- jsonlite::toJSON(x, auto_unbox = TRUE)
  }

  as.character(x)
}

# What every tool goes through on its way into the client: once over the
# registered set when the client is built, and again for each typed tool the
# pool mints afterwards.
prepare_tool <- function(tool) {
  as_text_tool(annotate_tool_title(tool))
}

prepare_tools <- function(client) {

  client$set_tools(lapply(client$get_tools(), prepare_tool))

  invisible(client)
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
