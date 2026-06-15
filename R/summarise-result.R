#' Summarise a block result for the LLM
#'
#' Generic dispatch on the result's class. The default forwards to
#' [btw::btw_this()], which ships methods for data frames, tibbles,
#' matrices, and falls back to a truncated `print()` for everything
#' else. Define methods to override the summary for specific result
#' classes (e.g. when `btw_this()` lacks a method or its output is
#' too verbose for token budgets).
#'
#' Methods should keep their output bounded -- roughly 1-2 KB of
#' text per call is a sensible ceiling. The LLM pays in tokens for
#' every line returned, and an unbounded `print()` of a large
#' object will both blow the budget and bury the relevant
#' structural information in noise. The default (`btw::btw_this()`)
#' truncates aggressively; overrides should too.
#'
#' @param x A block result, as returned by the block's `result`
#'   reactive.
#' @param ... Passed to methods.
#'
#' @return Character vector of lines.
#'
#' @examples
#' summarise_result(head(iris))
#'
#' @export
summarise_result <- function(x, ...) {
  UseMethod("summarise_result")
}

#' @rdname summarise_result
#' @export
summarise_result.default <- function(x, ...) {
  as.character(btw::btw_this(x, ...))
}

#' @rdname summarise_result
#' @export
summarise_result.dm <- function(x, ...) {

  # A `dm` is a relational set of tables, not a single data frame. The default
  # (btw_this / str) buries the table+column structure, so the model can't see
  # which tables exist or their columns -- it then guesses column names, or
  # tries to query the tables directly and gives up ("adsl not found"). Surface
  # one compact schema line per table, and state the access rule: a dm table is
  # NOT a data frame until pulled, so a dm_pull_block must come first.

  tables <- dm_result_tables(x)

  if (!length(tables)) {
    return(summarise_result.default(x, ...))
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
    types <- vapply(tbl, function(col) class(col)[1L], character(1))
    cols <- paste0(names(tbl), " (", types, ")")
    if (length(cols) > 60L) {
      cols <- c(cols[seq_len(60L)], sprintf("... (+%d more)", length(cols) - 60L))
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

# ---- COPIED FROM blockr.ai (R/effect.R `effect_tables`) ----
# Intentionally a local copy, NOT a blockr.ai dependency, for now. When the dm
# description helpers are shared (e.g. a common blockr.ai / blockr.ui home),
# delete this and call the shared version. Keep in sync until then.
dm_result_tables <- function(x) {
  if (inherits(x, "dm")) {
    if (requireNamespace("dm", quietly = TRUE)) {
      t <- tryCatch(
        dm::dm_get_tables(x),
        error = function(e) NULL, warning = function(w) NULL
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
    dfs <- Filter(is.data.frame, x)
    if (length(dfs)) {
      return(dfs)
    }
  }
  NULL
}
