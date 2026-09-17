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

#' The result the assistant reads for a block
#'
#' What `get_block_result` and the post-commit review describe for a block.
#' By default that is the block's evaluated result. A block whose evaluated
#' result is not what it shows can say what the model should read instead:
#' a display block that passes its input through and draws something else
#' from it (a composer table, whose result is the data it was fed) would
#' otherwise leave the model reading its input and unable to check what it
#' built.
#'
#' @param x The block object.
#' @param result The block's evaluated result.
#' @param server The block's server object, whose `state` holds the block's
#'   current settings as reactives.
#' @param ... For methods.
#'
#' @return The object to describe with [describe_result()].
#'
#' @export
llm_block_result <- function(x, result, server, ...) {
  UseMethod("llm_block_result")
}

#' @rdname llm_block_result
#' @export
llm_block_result.default <- function(x, result, server, ...) {
  result
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

  # isolate(): a tool call runs outside a reactive consumer, and `blocks` is a
  # reactiveValues, so reading it bare throws "Can't access reactive value
  # 'blocks' outside of reactive consumer" -- which reached the model as
  # get_block_result's answer for every block that HAS a result. The early
  # return above hides it for a block that has none, so the tool looked
  # healthy exactly where it was useless.
  entry <- isolate(board$blocks[[id]])

  res <- tryCatch(
    isolate(
      llm_block_result(entry$block, entry$server$result(), entry$server)
    ),
    error = function(e) e
  )

  if (inherits(res, "error")) {
    return(no_result_message(id, status, res))
  }

  paste(summarise_result(res), collapse = "\n")
}
