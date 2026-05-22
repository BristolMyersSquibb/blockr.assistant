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
