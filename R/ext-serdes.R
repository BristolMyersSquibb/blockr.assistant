#' @export
blockr_deser.assistant_extension <- function(x, data, ...) {

  payload <- data[["payload"]]

  if (is.list(payload)) {

    # Boards saved before the conversation moved into a `history` blob carry
    # recorded turns here. Replaying those is what takes the board down, and
    # they are mistyped beyond what is worth repairing, so they are discarded.
    payload[["messages"]] <- NULL
    payload[["threads"]]  <- NULL

    restored <- deserialize_chat_history(payload[["history"]])

    if (is_thread_set(restored)) {
      payload[["threads"]] <- restored
    } else {
      payload[["messages"]] <- restored
    }

    payload[["history"]] <- NULL

    data[["payload"]] <- payload
  }

  NextMethod()
}

# Boards saved with a single conversation carry a list of recorded turns;
# boards saved with threads carry conversation records, which are the only
# ones to declare a schema version.
is_thread_set <- function(x) {

  if (!is.list(x) || !length(x)) {
    return(FALSE)
  }

  all(
    lgl_ply(x, function(rec) is.list(rec) && not_null(rec[["schema_version"]]))
  )
}

chat_save_turns <- function() {
  validate_save_turns(blockr_option("chat_save_turns", 50L))
}

validate_save_turns <- function(x) {

  if (!is_whole_bound(x, 0)) {
    blockr_abort(
      "Expecting `chat_save_turns` to be `0`, a positive whole number or ",
      "`Inf`.",
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

serialize_chat_threads <- function(store, save_turns, unrecorded = list()) {

  if (save_turns <= 0) {
    return(NULL)
  }

  raw <- store$threads()

  if (!length(raw) && length(unrecorded)) {
    raw <- list(c_restored = migrated_thread(unrecorded))
  }

  threads <- Filter(
    not_null,
    lapply(raw, save_ready_thread, save_turns)
  )

  if (!length(threads)) {
    return(NULL)
  }

  jsonlite::serializeJSON(threads)
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

save_ready_thread <- function(record, save_turns) {

  record <- trim_thread(record, save_turns)

  if (is.null(record)) {
    return(NULL)
  }

  record[["nodes"]] <- lapply(record[["nodes"]], node_without_responses)

  record
}

node_without_responses <- function(node) {

  node[["turns"]] <- lapply(node[["turns"]], drop_raw_response)

  node
}

drop_raw_response <- function(rec) {

  if ("json" %in% names(rec[["props"]])) {
    rec[["props"]][["json"]] <- list()
  }

  rec
}

has_content <- function(rec, class) {
  any(chr_xtr(rec[["props"]][["contents"]], "class") == class)
}
