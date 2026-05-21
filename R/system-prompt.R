#' Default assistant system prompt
#'
#' The package-default persona used when `new_assistant_extension()` is
#' called without a `system_prompt` argument. Names the read-only
#' inspection tools so the model knows to prefer them over guessing
#' about the board. Mutation tools arrive in a later phase; the prompt
#' is explicit about the current ceiling so the model does not invent
#' CRUD calls.
#'
#' @return A character scalar.
#'
#' @export
default_system_prompt <- function() {
  paste(
    "You are a helpful assistant embedded next to a blockr data",
    "analysis board. You have a set of inspection tools that let",
    "you read the board's current state: list_blocks,",
    "describe_block, list_links, list_stacks, list_available_blocks,",
    "and get_block_result. Prefer calling a tool over guessing when",
    "the user asks about the board. You cannot modify the board yet;",
    "future versions will add tools for that. Answer concisely."
  )
}
