#' Describe a block result for the LLM
#'
#' Generic behind what the assistant tells the model about a block's result.
#' R answers the assistant's request `describe_result` through it.
#' The tool `get_block_result` and the review of an edit send that request.
#' The default method delegates to [btw::btw_this()].
#' A package contributing an unusual result type can add a method to describe
#' it directly, in blockr terms, instead of supplying a [btw::btw_this()]
#' method.
#'
#' Methods for plots ship here, since the default describes none.
#' A block that draws a ggplot returns the ggplot.
#' A block whose expression draws a base plot returns a `captured_plot`, which
#' [blockr.core::capture_plot()] makes.
#' The default prints either, which draws the plot on a new device, and writes
#' nothing.
#' A block that evaluates its expression with [evaluate::evaluate()] returns an
#' evaluation, which may hold recordings.
#' The default writes their display list, a list of graphics primitives rather
#' than a description of the chart.
#' The methods name the class, count the recordings, and say when a block
#' evaluated without drawing.
#' None of them describes the chart itself: the request `inspect_results`
#' draws it on a device.
#'
#' The [evaluate::evaluate()] method describes each component through the
#' generic rather than reading the container as one shape, so an evaluation
#' mixing plots with output and conditions is handled by whatever methods
#' exist for its parts -- including ones another package adds. That is what
#' keeps a warning's message from being reduced to a count of warnings. To
#' describe a whole result differently, give it a class of its own and
#' register a method on that, which takes precedence over all of these.
#'
#' Methods need not bound their output or guard their own errors: the internal
#' `summarise_result()` wrapper caps the text before it reaches the prompt and
#' turns a failed description into a surfaced error message.
#' It is what the request `describe_result` calls.
#'
#' @param x A block result (any R object).
#' @param ... Passed on to methods (e.g. [btw::btw_this()]).
#'
#' @return Character vector of lines; the caller collapses with
#'   `paste(collapse = "\n")`.
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

  # Describe each component through the generic rather than tallying the
  # container by kind. A count is enough for a plot, whose content is the
  # picture and not the text, but never for a condition: "1 warning" drops the
  # message, which is the whole of what a warning carries. Recursing also
  # means an evaluation of any shape is handled by whatever methods exist,
  # including ones another package adds, instead of by a reading of the
  # container written for one block type.
  chr_ply(x, describe_component, ..., use_names = FALSE)
}

# Evaluate labels its text output by position rather than by class -- a plain
# character vector, with nothing to dispatch on -- so the container names it.
# Everything else carries a class and goes through the generic.
describe_component <- function(x, ...) {

  if (is.character(x)) {
    return(paste("Output:", trimws(paste(x, collapse = "\n"))))
  }

  paste(describe_result(x, ...), collapse = "\n")
}

#' @rdname describe_result
#' @export
describe_result.recordedplot <- function(x, ...) {
  "Recorded plot (`recordedplot`)."
}

#' @rdname describe_result
#' @export
describe_result.captured_plot <- function(x, ...) {
  "Captured plot (`captured_plot`)."
}

#' @rdname describe_result
#' @export
describe_result.ggplot <- function(x, ...) {
  "Plot made with ggplot2 (`ggplot`)."
}

#' @rdname describe_result
#' @export
describe_result.source <- function(x, ...) {
  paste("Source:", trimws(x[["src"]]))
}

#' @rdname describe_result
#' @export
describe_result.condition <- function(x, ...) {

  # Read the kind off evaluate's own predicates rather than off a position in
  # the class vector: a condition from rlang or vctrs carries several classes
  # ahead of the one that says what it is.
  kind <- if (evaluate::is.error(x)) {
    "Error"
  } else if (evaluate::is.warning(x)) {
    "Warning"
  } else if (evaluate::is.message(x)) {
    "Message"
  } else {
    "Condition"
  }

  paste0(kind, ": ", trimws(conditionMessage(x)))
}

# Bounded, error-guarding wrapper around describe_result(): a method is trusted
# neither to bound its output nor to catch its own failures, so both happen
# here, on the one path that the request `describe_result` reads results
# through.
# A failed description surfaces its message rather than taking the review
# down.
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
