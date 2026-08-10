#' @export
blockr_deser.assistant_extension <- function(x, data, ...) {

  payload <- data[["payload"]]

  if (is.list(payload)) {

    # Boards saved before the conversation moved into a `history` blob carry
    # recorded turns here. Replaying those is what takes the board down, and
    # they are mistyped beyond what is worth repairing, so they are discarded.
    payload[["messages"]] <- NULL

    if (!is.null(payload[["history"]])) {
      payload[["messages"]] <- deserialize_chat_history(payload[["history"]])
      payload[["history"]] <- NULL
    }

    data[["payload"]] <- payload
  }

  NextMethod()
}
