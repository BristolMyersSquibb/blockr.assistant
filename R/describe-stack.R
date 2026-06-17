#' Describe a stack for the LLM
#'
#' Generic backing the `description` column of the `list_stacks`
#' tool. The default method `describe_stack.stack` summarises the
#' base stack fields (name and comma-separated block ids). Stack
#' classes that carry extra attributes (e.g. `blockr.dag::dag_stack`
#' with a colour) override their class to surface those attributes.
#'
#' @param x A `stack`.
#' @param ... For future use.
#'
#' @return Character vector of lines (consistent with
#'   `summarise_result()` and [describe_block()]). The tool that
#'   consumes this collapses with `paste(..., collapse = "\n")`
#'   before returning to ellmer.
#'
#' @export
describe_stack <- function(x, ...) UseMethod("describe_stack")

#' @rdname describe_stack
#' @export
describe_stack.stack <- function(x, ...) {

  blocks <- stack_blocks(x)

  sprintf(
    "stack '%s' (blocks: %s)",
    coal(stack_name(x), "<unnamed>"),
    if (length(blocks)) paste(blocks, collapse = ", ") else "<empty>"
  )
}
