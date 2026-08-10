validate_save_turns <- function(x) {

  ok <- is.numeric(x) && is_scalar(x) && !is.na(x) && x >= 0 &&
    (is.infinite(x) || isTRUE(x == trunc(x)))

  if (!ok) {
    blockr_abort(
      "Expecting `save_turns` to be `0`, a positive whole number or `Inf`.",
      class = "invalid_save_turns"
    )
  }

  x
}

client_turns <- function(client) {

  if (is.null(client)) {
    return(list())
  }

  client$get_turns()
}

serialize_chat_history <- function(turns, save_turns) {

  if (!length(turns) || save_turns <= 0) {
    return(NULL)
  }

  recs <- drop_unpaired_tool_turns(
    last_turns(lapply(turns, record_without_response), save_turns)
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

last_turns <- function(recs, save_turns) {

  if (is.infinite(save_turns) || length(recs) <= save_turns) {
    return(recs)
  }

  recs[seq.int(length(recs) - save_turns + 1L, length(recs))]
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
