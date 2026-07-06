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

#' @rdname describe_result
#' @export
describe_result.dm <- function(x, ...) {

  # A `dm` is a relational set of tables, not a single data frame. The default
  # (btw_this / str) buries the table+column structure, so the model can't see
  # which tables exist or their columns -- it then guesses column names, or
  # tries to query the tables directly and gives up ("adsl not found"). Surface
  # one compact schema line per table, and state the access rule: a dm table is
  # NOT a data frame until pulled, so a dm_pull_block must come first.

  tables <- dm_result_tables(x)

  if (!length(tables)) {
    return(describe_result.default(x, ...))
  }

  lines <- c(
    sprintf(
      paste(
        "dm (relational set of %d tables). A dm table is NOT a queryable",
        "data frame until extracted: add a dm_pull_block(table=\"<name>\")",
        "downstream to use one in a chart/summary/dplyr block. Tables and",
        "their columns:"
      ),
      length(tables)
    ),
    ""
  )

  for (nm in names(tables)) {
    tbl <- tables[[nm]]
    types <- vapply(tbl, function(col) class(col)[1L], character(1L))
    cols <- paste0(names(tbl), " (", types, ")")
    if (length(cols) > 60L) {
      cols <- c(
        cols[seq_len(60L)],
        sprintf("... (+%d more)", length(cols) - 60L)
      )
    }
    lines <- c(
      lines,
      sprintf(
        "- %s: %d rows x %d cols: %s",
        nm, nrow(tbl), ncol(tbl), paste(cols, collapse = ", ")
      )
    )
  }

  lines
}

# ---- ADAPTED FROM blockr.ai (R/effect.R `effect_tables`) ----
# Local copy so describe_result.dm works without blockr.ai installed (the
# effect lines in flush-outcome.R use blockr.ai::data_effect behind a
# requireNamespace guard instead). Keep in sync.
dm_result_tables <- function(x) {

  if (inherits(x, "dm")) {

    if (requireNamespace("dm", quietly = TRUE)) {
      t <- tryCatch(
        dm::dm_get_tables(x),
        error = function(e) NULL,
        warning = function(w) NULL
      )
      if (length(t)) {
        return(t)
      }
    }

    # Fallback for test doubles / plain table lists wearing a dm class.
    t2 <- Filter(is.data.frame, unclass(x))
    if (length(t2)) {
      return(t2)
    }

    return(NULL)
  }

  if (is.list(x) && !is.null(names(x))) {
    t <- Filter(is.data.frame, x)
    if (length(t)) {
      return(t)
    }
  }

  NULL
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
