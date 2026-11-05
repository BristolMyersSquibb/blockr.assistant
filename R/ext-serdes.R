#' @export
blockr_deser.assistant_extension <- function(x, data, ...) {

  payload <- data[["payload"]]

  if (is.list(payload)) {

    # Cleared rather than trusted: the `threads` key is this method's to
    # write, and `messages` is one older saves carried that no longer names a
    # constructor argument -- left in place it reaches `do.call()` and takes
    # the board down on an unused argument.
    payload[["threads"]]  <- NULL
    payload[["messages"]] <- NULL

    # Anything else was written by a shape this package no longer produces,
    # and guessing at it buys nothing -- the board opens without its
    # conversation rather than on a wrong one.
    if (is_thread_set(payload[["history"]])) {
      payload[["threads"]] <- payload[["history"]]
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

  threads
}

save_ready_thread <- function(record, save_turns) {

  record <- trim_thread(record, save_turns)

  if (is.null(record)) {
    return(NULL)
  }

  map_record_turns(record, drop_raw_response)
}

# Applies `fun` to every recorded turn of a conversation record.
map_record_turns <- function(record, fun) {

  record[["nodes"]] <- lapply(
    record[["nodes"]],
    function(node) {
      node[["turns"]] <- lapply(node[["turns"]], fun)
      node
    }
  )

  record
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

# A thread saved under ellmer 0.4 holds each tool result as the tool returned
# it, a list or data.frame included.
# That version converted a result to JSON only at the moment of sending.
# Since 0.5.0, ellmer sends a replayed result as it is,
# and the provider rejects the request with HTTP 400.
# A saved `NULL` result fails the same way.
# Such results are converted once, when the thread store is built.
normalize_thread_results <- function(threads) {
  lapply(threads, map_record_turns, normalize_turn_results)
}

normalize_turn_results <- function(rec) {

  rec[["props"]][["contents"]] <- lapply(
    rec[["props"]][["contents"]],
    normalize_recorded_result
  )

  rec
}

normalize_recorded_result <- function(rec) {

  props <- rec[["props"]]

  if (!identical(rec[["class"]], "ellmer::ContentToolResult") ||
        not_null(props[["error"]]) ||
        is_recorded_content(props[["value"]])) {
    return(rec)
  }

  rec[["props"]]["value"] <- list(normalize_tool_result(props[["value"]]))

  rec
}

# Content that a tool returned, such as an image, is recorded as a list that
# carries the class of the object.
# Replayed, the list is Content again.
is_recorded_content <- function(x) {

  is_record <- function(el) {
    is.list(el) && is_string(el[["class"]]) &&
      startsWith(el[["class"]], "ellmer::Content")
  }

  is_record(x) || (is.list(x) && length(x) > 0L && all(lgl_ply(x, is_record)))
}
