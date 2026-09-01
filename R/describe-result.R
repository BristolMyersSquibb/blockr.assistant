#' Describe a block result for the LLM
#'
#' Generic backing the result summaries the assistant feeds the model: the
#' `get_block_result` tool and the post-apply review it sends itself. The
#' default method delegates to [btw::btw_this()]. A package contributing an
#' unusual result type can add a method to describe it directly, in blockr
#' terms, instead of supplying a [btw::btw_this()] method.
#'
#' Methods for recorded plots ship here, since a plot block built on
#' [blockr.core::new_plot_block()] evaluates to recordings and the default
#' renders their display list -- a list of graphics primitives, not a
#' description of the chart. They name the class and count the recordings, and
#' say when a block evaluated without drawing. Neither describes the chart
#' itself: `inspect_results` renders it, by drawing it on a device.
#'
#' Methods need not bound their output or guard their own errors: the internal
#' `summarise_result()` wrapper caps the text before it reaches the prompt and
#' turns a failed description into a surfaced error message. It is what the
#' tool and the review actually call.
#'
#' @param x A block result (any R object).
#' @param ... Passed on to methods (e.g. [btw::btw_this()]).
#'
#' @return Character vector of lines, consistent with [describe_block()] and
#'   [describe_stack()]; the caller collapses with `paste(collapse = "\n")`.
#'
#' @export
describe_result <- function(x, ...) {
  UseMethod("describe_result")
}

#' @rdname describe_result
#' @export
describe_result.default <- function(x, ...) {
  btw::btw_this(x, ...)
}

#' @rdname describe_result
#' @export
describe_result.evaluate_evaluation <- function(x, ...) {
  describe_plot_result(length(Filter(evaluate::is.recordedplot, x)))
}

#' @rdname describe_result
#' @export
describe_result.recordedplot <- function(x, ...) {
  describe_plot_result(1L)
}

# What a recorded plot is worth saying, and no more. The default renders the
# display list -- eight C entry points for core's scatter block -- which tells
# a model reviewing the block only that eight primitives were drawn. The
# recording does carry real content (for that block, C_plot_window holds the
# axis ranges and C_plotXY the data), but reading it means parsing
# undocumented entry points positionally against R's graphics internals, and
# they differ per engine: `recordedplot` is a display list, which grid and
# lattice produce as readily as base graphics, so there is no one grammar to
# parse. Naming the class is enough -- a model given only that reaches for
# inspect_results unprompted, and drawing it there is what renders the chart.
describe_plot_result <- function(n_plot) {

  if (!n_plot) {
    return(
      glue::glue(
        "Graphics result: no recorded plot -- the block evaluated ",
        "without drawing anything."
      )
    )
  }

  glue::glue(
    "Graphics result: {n_plot} recorded ",
    "plot{if (n_plot > 1L) 's' else ''} (`recordedplot`)."
  )
}

# Bounded, error-guarding wrapper around describe_result(): a method is trusted
# neither to bound its output nor to catch its own failures, so both happen
# here -- the single path the get_block_result tool and the post-apply review
# read results through. A failed description surfaces its message rather than
# taking the review down.
summarise_result <- function(x, ..., max_chars = summary_max_chars()) {

  text <- tryCatch(
    describe_result(x, ...),
    error = function(e) {
      paste(
        "The following error occurred while summarising this result:",
        conditionMessage(e)
      )
    }
  )

  truncate_chars(paste(text, collapse = "\n"), max_chars)
}

# The eval status is consulted BEFORE the result: a block holding none answers
# with a `NULL` result or a shiny.silent.error carrying no message, neither of
# which distinguishes "nothing evaluated" from a block that legitimately
# evaluated to NULL. Reading a dormant block's result() also re-enters its
# gated pipeline for nothing.
block_result_summary <- function(id, board) {

  status <- eval_status(id, board)

  if (has_no_result(status)) {
    return(no_result_message(id, status))
  }

  res <- tryCatch(
    isolate(board$blocks[[id]]$server$result()),
    error = function(e) e
  )

  if (inherits(res, "error")) {
    return(no_result_message(id, status, res))
  }

  paste(summarise_result(res), collapse = "\n")
}
