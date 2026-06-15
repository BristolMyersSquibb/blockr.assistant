#' Summarise a block for the LLM prompt context
#'
#' Generic backing the per-block lines in the dynamic system
#' prompt's board summary. The default method
#' `summarise_block.block` returns a compact one-line summary
#' (id, class, current arg values, modifiable keys). Block
#' authors override their class when the default is too generic
#' or too verbose for prompt context.
#'
#' Parallel to [describe_block()] (which produces the full
#' multi-line description used by the `describe_block` tool).
#' Use `summarise_block` when token density matters; use
#' `describe_block` when the user has explicitly asked for
#' detail.
#'
#' @param x A `block`.
#' @param board The current board snapshot, for resolving
#'   cross-references. May be `NULL` -- currently unused by the
#'   default method, reserved for overrides that want to surface
#'   relationships.
#' @param id The id under which the block lives on the board.
#' @param ... For future use.
#'
#' @return A single-line character scalar (preferred). Multi-line
#'   output is accepted but inflates the prompt budget.
#'
#' @export
summarise_block <- function(x, board, id, ...) {
  UseMethod("summarise_block")
}

#' @rdname summarise_block
#' @export
summarise_block.block <- function(x, board, id, ...) {

  # initial_block_state() and block_ctor_inputs() are not (yet)
  # exported from blockr.core; format.block uses them internally
  # to render the "Initial block state:" section. Tracking export
  # at blockr.core (TBD).
  args <- blockr.core:::initial_block_state(x)  # nolint
  ctrl <- attr(x, "external_ctrl")

  args_str <- if (length(args)) {

    paste(
      chr_ply(names(args), function(nm) {
        # format() can yield character(0) (empty arg) or a vector
        # (e.g. crossfilter active_dims); collapse to a single string
        # so the enclosing sprintf/chr_ply never sees length != 1.
        val <- paste0(format(args[[nm]]), collapse = ", ")
        sprintf("%s=%s", nm, val)
      }),
      collapse = ", "
    )

  } else {
    "no args"
  }

  ctrl_str <- if (isTRUE(ctrl)) {
    "all args + block_name"
  } else if (isFALSE(ctrl) || !length(ctrl)) {
    "block_name only"
  } else {
    paste(c(ctrl, "block_name"), collapse = ", ")
  }

  sprintf(
    "- %s (%s): %s [modifiable: %s]",
    id, class(x)[[1L]], args_str, ctrl_str
  )
}
