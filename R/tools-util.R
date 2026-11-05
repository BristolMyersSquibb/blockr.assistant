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

# A `ToolDef` is a closure that carries its props as attributes,
# so the wrapper takes them over as they are.
prepare_tool <- function(tool) {

  tool <- annotate_tool_title(tool)

  res <- function(...) normalize_tool_result(tool(...))
  attributes(res) <- attributes(tool)

  res
}

prepare_tools <- function(client) {

  client$set_tools(lapply(client$get_tools(), prepare_tool))

  invisible(client)
}

# Since 0.5.0, ellmer converts a result that is not a string, `json` or
# Content when a tool returns it, and warns that this is deprecated.
# A `NULL` result and the value of a returned ContentToolResult skip that
# conversion and reach the provider raw, where it expects a string.
# We make that conversion here, but to a plain-character JSON string rather than
# a `json`-classed value, so the result leaves as a text block (see below).
normalize_tool_result <- function(x) {

  if (promises::is.promise(x)) {
    return(promises::then(x, normalize_tool_result))
  }

  if (inherits(x, "ellmer::ContentToolResult")) {

    if (is.null(x@error)) {
      x@value <- normalize_tool_result(x@value)
    }

    return(x)
  }

  # Content objects (and lists of them) are serialised by the provider, so pass
  # them through untouched.
  if (inherits(x, "ellmer::Content")) {
    return(x)
  }

  if (is.list(x) && length(x) > 0L &&
        all(lgl_ply(x, inherits, "ellmer::Content"))) {
    return(x)
  }

  if (is.character(x)) {
    return(paste(x, collapse = "\n"))
  }

  # Everything else becomes a plain-character JSON *string*, never a `json`-
  # classed value. ellmer routes a `json`-classed tool result into a
  # `toolResult.content[].json` block, which the BMS LLM Gateway rejects
  # ("the format of the value at ...toolResult.content.0.json is invalid.
  # Provide a json object"). A plain string goes out as a text block that every
  # provider accepts. A value that is already `json` just drops its class;
  # anything else is serialised and then unclassed.
  if (inherits(x, "json")) {
    return(as.character(x))
  }

  as.character(jsonlite::toJSON(x, auto_unbox = TRUE))
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
