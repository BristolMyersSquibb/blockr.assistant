# Boards saved before the conversation was dropped from extension state carry
# a `messages` payload of recorded turns. Replaying those is what takes the
# board down, and they are unrecoverable in any case, so they are discarded
# rather than migrated.

#' @export
blockr_deser.assistant_extension <- function(x, data, ...) {

  if (is.list(data[["payload"]]) && "messages" %in% names(data[["payload"]])) {
    data[["payload"]][["messages"]] <- NULL
  }

  NextMethod()
}
