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
#' The [evaluate::evaluate()] method claims only evaluations that carry a
#' recording, and defers to the default otherwise, since `evaluate_evaluation`
#' is a general container this package does not own -- a result of some other
#' shape keeps the description it would have had. Anything it does claim is
#' counted by kind rather than dropped. To describe a result differently, give
#' it a class of its own and register a method on that: a method on a subclass
#' takes precedence over both of these.
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

  # An unfiltered evaluation always records its source, so nothing left here
  # means something filtered it -- which is what block_eval.plot_block() does,
  # keeping the recordings and dropping the rest. Empty is therefore the block
  # that ran and drew nothing, the case the display list cannot distinguish.
  if (!length(x)) {
    return(
      paste(
        "Empty evaluation: the block evaluated without drawing or",
        "producing output."
      )
    )
  }

  plots <- lgl_ply(x, evaluate::is.recordedplot)

  # Claim only what this method improves on. An evaluation carrying no
  # recording has no display list to render, so the default describes it
  # better than a plot-shaped sentence can -- and a package whose results are
  # evaluations of some other shape keeps the description it would otherwise
  # have had, rather than one written for blockr.core's plot block.
  if (!any(plots)) {
    return(NextMethod())
  }

  describe_plot_result(sum(plots), evaluation_parts(x[!plots]))
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
describe_plot_result <- function(n_plot, parts = integer()) {

  plots <- glue::glue(
    "{n_plot} recorded plot{if (n_plot > 1L) 's' else ''} (`recordedplot`)"
  )

  if (!length(parts)) {
    return(glue::glue("Graphics result: {plots}."))
  }

  rest <- paste0(parts, " ", names(parts), ifelse(parts > 1L, "s", ""))
  rest <- paste_enum(rest, quotes = "")

  glue::glue("Graphics result: {plots}, with {rest}.")
}

# What the evaluation carries besides its recordings, counted by kind. The
# method claims the whole container, so anything it stays silent about is
# something the model never learns the block produced.
evaluation_parts <- function(x) {

  kinds <- list(
    source  = evaluate::is.source,
    error   = evaluate::is.error,
    warning = evaluate::is.warning,
    message = evaluate::is.message
  )

  n <- int_ply(kinds, function(f) sum(lgl_ply(x, f)), use_names = TRUE)

  n <- c(n, output = length(x) - sum(n))

  n[n > 0L]
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
