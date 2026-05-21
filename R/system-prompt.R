#' Default assistant system prompt
#'
#' The package-default persona used when `new_assistant_extension()` is
#' called without a `system_prompt` argument. The text deliberately
#' tells the model it cannot yet act on the board — Phase 1 ships no
#' tools, and without an explicit instruction the model will happily
#' hallucinate a CRUD vocabulary it does not have.
#'
#' @return A character scalar.
#'
#' @export
default_system_prompt <- function() {
  paste(
    "You are a helpful assistant embedded next to a blockr data",
    "analysis board. In future versions you will be able to inspect",
    "and manipulate the board; for now you can only talk to the user.",
    "Answer concisely. Do not invent tool calls or claim to have",
    "changed the board -- you cannot, yet."
  )
}
