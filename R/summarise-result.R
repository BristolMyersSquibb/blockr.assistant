#' Describe a block result for the LLM
#'
#' Generic backing the result summaries the assistant feeds the model: the
#' `get_block_result` tool and the post-apply review it sends itself. The
#' default method delegates to [btw::btw_this()]. A package contributing an
#' unusual result type can add a method to describe it directly, in blockr
#' terms, instead of supplying a [btw::btw_this()] method.
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

summary_max_chars <- function() {
  as.integer(blockr_option("assistant_summary_max_chars", 2000L))
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

  truncate_chars(
    paste(text, collapse = "\n"), max_chars,
    hint = "use query_data to fetch specific rows or columns"
  )
}

# Cap `txt` so the returned string -- truncated text plus the marker and any
# hint -- never exceeds `max_chars`: the marker counts against the budget, it
# is not added on top. Only the over-long case is touched; text within budget
# is returned verbatim. The hint is the caller's: a result summary points at
# query_data, a block or stack summary needs none.
truncate_chars <- function(txt, max_chars, hint = NULL) {

  if (nchar(txt) <= max_chars) {
    return(txt)
  }

  suffix <- if (is.null(hint)) "" else paste0(" -- ", hint)
  marker <- function(omitted) {
    sprintf("\n... [+%d chars truncated%s]", omitted, suffix)
  }

  # Reserve room for the marker sized against the largest possible omitted
  # count (the whole input), so the reservation always covers the real one.
  keep <- max(0L, max_chars - nchar(marker(nchar(txt))))

  paste0(substr(txt, 1L, keep), marker(nchar(txt) - keep))
}
