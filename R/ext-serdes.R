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
