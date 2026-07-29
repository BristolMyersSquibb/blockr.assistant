#' Assistant extension deserialization
#'
#' Boards saved before the conversation was dropped from extension state
#' carry a `messages` payload of recorded `ellmer` turns. Those records do
#' not survive the JSON round trip -- `ellmer::contents_replay()` aborts on
#' the integer `version` `jsonlite` reads back, and on the `"NA"` strings the
#' `cost` and `duration` props become -- and the replay happens in a board
#' server observer, so the failure takes down the whole board rather than
#' just the chat panel. Such a board is unopenable as written, and the
#' payload is unrecoverable in any case, so it is dropped here.
#'
#' @param x Object to dispatch on
#' @param data List valued data (converted from JSON)
#' @param ... Forwarded to the `dock_extension` method
#'
#' @return A `dock_extension` inheriting from `assistant_extension`.
#'
#' @export
blockr_deser.assistant_extension <- function(x, data, ...) {

  if (is.list(data[["payload"]]) && "messages" %in% names(data[["payload"]])) {
    data[["payload"]][["messages"]] <- NULL
  }

  NextMethod()
}
