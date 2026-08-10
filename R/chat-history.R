new_chat_history_option <- function(value = blockr_option("chat_history_kb",
                                                          64L),
                                    category = "Board options", ...) {

  new_board_option(
    id = "chat_history_kb",
    default = value,
    ui = function(id) {
      numericInput(
        NS(id, "chat_history_kb"),
        "Chat history saved with board (KB)",
        value,
        min = 0L,
        step = 8L
      )
    },
    server = function(..., session) {
      observeEvent(
        get_board_option_or_null("chat_history_kb", session),
        {
          updateNumericInput(
            session,
            "chat_history_kb",
            value = get_board_option_value("chat_history_kb", session)
          )
        }
      )
    },
    transform = function(x) as.integer(x),
    category = category,
    ...
  )
}

#' @export
validate_board_option.chat_history_kb_option <- function(x) {

  val <- board_option_value(NextMethod())

  if (!is_count(val, allow_zero = TRUE)) {
    blockr_abort(
      "Expecting `chat_history_kb` to be a non-negative count.",
      class = "chat_history_kb_option_invalid"
    )
  }

  invisible(x)
}

client_turns <- function(client) {

  if (is.null(client)) {
    return(list())
  }

  client$get_turns()
}

serialize_chat_history <- function(turns, max_bytes) {

  if (!length(turns) || max_bytes <= 0) {
    return(NULL)
  }

  recs <- drop_unpaired_tool_turns(
    fit_history_budget(lapply(turns, record_without_response), max_bytes)
  )

  if (!length(recs)) {
    return(NULL)
  }

  jsonlite::serializeJSON(recs)
}

deserialize_chat_history <- function(blob) {

  blob <- unlst(blob)

  if (!is_string(blob)) {
    return(NULL)
  }

  # A board that cannot be read is worse than one that opens without its
  # conversation, which is the whole point of this code path.
  tryCatch(jsonlite::unserializeJSON(blob), error = function(e) NULL)
}

record_without_response <- function(turn) {

  rec <- ellmer::contents_record(turn)

  if ("json" %in% names(rec[["props"]])) {
    rec[["props"]][["json"]] <- list()
  }

  rec
}

fit_history_budget <- function(recs, max_bytes) {

  while (length(recs) && history_bytes(recs) > max_bytes) {
    recs <- recs[-1L]
  }

  recs
}

# A window cut out of the middle of a conversation can open on a tool result
# whose request fell outside it, or close on a request whose result did.
# Providers reject either half, so the window is shrunk to whole exchanges.
drop_unpaired_tool_turns <- function(recs) {

  while (length(recs) && has_content(recs[[1L]], "ellmer::ContentToolResult")) {
    recs <- recs[-1L]
  }

  while (length(recs) &&
           has_content(recs[[length(recs)]], "ellmer::ContentToolRequest")) {
    recs <- recs[-length(recs)]
  }

  recs
}

has_content <- function(rec, class) {
  any(chr_xtr(rec[["props"]][["contents"]], "class") == class)
}

history_bytes <- function(recs) {
  nchar(jsonlite::serializeJSON(recs), type = "bytes")
}
