#' Publish a tool kit at a per-session URL
#'
#' Registers a session data object whose handler answers `GET` with the tool
#' list (MCP `inputSchema` per tool), the board summary and the instructions
#' the chat panel would put in its system prompt, and `POST` with the result of
#' one tool call. The URL carries the session token and Shiny's
#' nonce, so it addresses exactly one browser session and cannot be guessed.
#'
#' @param kit A tool kit from [agent_toolkit()].
#' @param session The module session.
#'
#' @return The URL path, relative to the app root.
#' @export
register_tool_endpoint <- function(kit, session) {

  root <- root_session(session)

  root$registerDataObj(
    endpoint_name(session), NULL,
    function(data, req) {
      shiny::withReactiveDomain(session, handle_request(kit, req))
    }
  )
}

# registerDataObj lives on the real session; a module proxy forwards the call
# but the URL it returns is the root token's either way. Name the object by the
# module namespace so two extensions on one board do not collide.
root_session <- function(session) {
  while (!is.null(session$rootScope) && !identical(session$rootScope(), session)) {
    session <- session$rootScope()
  }
  session
}

endpoint_name <- function(session) {
  gsub("[^A-Za-z0-9_]", "_", paste0(session$ns("agent")))
}

handle_request <- function(kit, req) {

  method <- req$REQUEST_METHOD

  if (identical(method, "GET")) {
    return(json_response(list(
      tools        = unname(lapply(kit$tools(), tool_as_json)),
      board        = kit$summary(),
      instructions = kit$instructions()
    )))
  }

  if (!identical(method, "POST")) {
    return(json_response(list(error = "use GET or POST"), status = 405L))
  }

  body <- tryCatch(read_json_body(req), error = function(e) e)

  if (inherits(body, "error")) {
    return(json_response(
      list(error = paste("bad JSON body:", conditionMessage(body))),
      status = 400L
    ))
  }

  tool <- kit$tools()[[body$name %||% ""]]

  if (is.null(tool)) {
    return(json_response(
      list(error = paste0("unknown tool '", body$name, "'")), status = 404L
    ))
  }

  # ellmer's own invocation path, so JSON arguments are converted by the
  # tool's declared types exactly as they are when the chat model calls it.
  request <- ellmer::ContentToolRequest(
    id = "http", name = tool@name, arguments = body$arguments %||% list(),
    tool = tool
  )

  res <- tryCatch(
    asNamespace("ellmer")$invoke_tool(request),
    error = function(e) structure(conditionMessage(e), class = "tool_error")
  )

  value <- if (inherits(res, "ellmer::ContentToolResult")) res@value else res

  if (promises::is.promise(value)) {
    return(promises::then(
      promises::catch(value, function(e) {
        log_tool_error(body$name, e)
        structure(conditionMessage(e), class = "tool_error")
      }),
      function(x) json_response(call_result(x))
    ))
  }

  json_response(call_result(res))
}

# MCP's tools/call shape, so the facade passes it through untouched.
call_result <- function(x) {

  is_error <- inherits(x, "tool_error")

  if (inherits(x, "ellmer::ContentToolResult")) {
    is_error <- !is.null(x@error)
    text <- asNamespace("ellmer")$tool_string(x)
  } else {
    text <- paste(as.character(x), collapse = "\n")
  }

  list(
    content = list(list(type = "text", text = text)),
    isError = is_error
  )
}

read_json_body <- function(req) {
  raw <- req$rook.input$read(-1L)
  if (!length(raw)) {
    stop("empty body", call. = FALSE)
  }
  jsonlite::fromJSON(rawToChar(raw), simplifyVector = FALSE)
}

# ellmer states a tool's arguments in its own type language; serialise them the
# way ellmer would for a provider, which is JSON schema.
tool_as_json <- function(tool) {

  as_json <- asNamespace("ellmer")$as_json
  schema  <- as_json(ellmer::Provider("dummy", "dummy", "dummy"), tool@arguments)
  schema$description <- NULL

  list(
    name        = tool@name,
    description = tool@description,
    inputSchema = schema
  )
}

json_response <- function(x, status = 200L) {
  shiny::httpResponse(
    status       = status,
    content_type = "application/json",
    content      = jsonlite::toJSON(x, auto_unbox = TRUE, null = "null")
  )
}

`%||%` <- function(x, y) if (is.null(x)) y else x

# The stack at the point of failure, to the app log: a tool body that dies
# outside the chat has no other place to report.
log_tool_error <- function(name, e) {
  calls <- vapply(sys.calls(), function(cl) {
    paste(deparse(cl, nlines = 1L, width.cutoff = 120L), collapse = "")
  }, character(1))
  message(sprintf("[agent] tool '%s' failed: %s | call: %s | class: %s", name,
                  conditionMessage(e),
                  paste(deparse(conditionCall(e), nlines = 1L), collapse = ""),
                  paste(class(e), collapse = "/")))
  message(paste0("  ", rev(calls)[seq_len(min(30L, length(calls)))],
                 collapse = "\n"))
  invisible()
}
