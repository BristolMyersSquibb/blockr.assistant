# shinychat display metadata for tool calls.
#
# shinychat 0.4 renders each tool call as a native card. Two knobs shape it:
# the tool's annotation title (the card header while the call runs and once
# it settles) and, for results, an `extra$display` list (what the USER sees
# in the card body -- the model keeps consuming the plain `value`).
# Annotation titles are set on every tool where it is built; the display
# wrapper below is applied where the raw value would be noise (query_data's
# REPL dump).

#' Strip ANSI SGR escape codes from a string.
#'
#' httr2/cli decorate error messages with terminal colour codes, which render
#' as tofu when the message lands in the chat widget.
#' @noRd
strip_ansi <- function(x) {
  gsub("\033\\[[0-9;]*m", "", x)
}

#' Wrap a query_data result with shinychat display metadata.
#'
#' The card shows the probe that was run (the R code, fenced) instead of the
#' captured REPL output; the model still receives the full output as the
#' tool value. Errors keep their failure text as the card body.
#' @noRd
query_card <- function(res, code) {

  failed <- is.character(res) && length(res) == 1L &&
    grepl("^query_data failed:", res)

  display <- if (failed) {
    list(title = "Exploration failed", markdown = strip_ansi(res))
  } else {
    list(
      title = "Explored data",
      markdown = paste0("```r\n", code, "\n```")
    )
  }

  ellmer::ContentToolResult(value = res, extra = list(display = display))
}
