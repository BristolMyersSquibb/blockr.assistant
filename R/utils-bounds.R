# Cap `txt` so the returned string -- truncated text plus the marker and any
# hint -- never exceeds `max_chars`: the marker counts against the budget, it
# is not added on top. Only the over-long case is touched; text within budget
# is returned verbatim. The hint is the caller's: a block summary points at
# get_block_state, while a result and a stack summary need none -- a result
# summary names what the result is, which is the pointer.
truncate_chars <- function(txt, max_chars, hint = NULL) {

  if (nchar(txt) <= max_chars) {
    return(txt)
  }

  suffix <- if (is.null(hint)) "" else paste0(" -- ", hint)
  marker <- function(omitted) {
    paste0("\n", glue::glue("... [+{omitted} chars truncated{suffix}]"))
  }

  # Reserve room for the marker sized against the largest possible omitted
  # count (the whole input), so the reservation always covers the real one.
  keep <- max(0L, max_chars - nchar(marker(nchar(txt))))

  paste0(substr(txt, 1L, keep), marker(nchar(txt) - keep))
}

is_whole_bound <- function(x, min) {
  is.numeric(x) && is_scalar(x) && !is.na(x) && x >= min &&
    (is.infinite(x) || isTRUE(x == trunc(x)))
}

summary_max_chars <- function() {
  as.integer(blockr_option("assistant_summary_max_chars", 2000L))
}

# The detail tier behind that summary: what get_block_state may spend across
# one block's argument values. Deliberately far above summary_max_chars(),
# because it is reached by a tool call the model makes when it is about to
# rewrite an argument, and a generated script runs to several thousand
# characters.
state_max_chars <- function() {
  as.integer(blockr_option("assistant_state_max_chars", 20000L))
}

# Per-value bound in a *summary* of block state, matching the `nchar.max` that
# utils::str() cuts character values at -- core's format.block() calls str()
# with the default and exposes no way to raise it. A value over this is elided
# rather than shown in part; see elide_long_values().
state_value_max_chars <- function() {
  as.integer(blockr_option("assistant_state_value_max_chars", 128L))
}

# Render size for a recorded plot returned by inspect_results, in pixels
# square. A 768px render of core's scatter block measures 23 KB, which both a
# frontier and a small model read correctly. The cap is what stops a block
# that draws in a loop from turning one tool call into a hundred images, each
# re-transmitted on every later request in the window.
plot_render_px <- function() {
  as.integer(blockr_option("assistant_plot_render_px", 768L))
}

plot_render_max <- function() {
  as.integer(blockr_option("assistant_plot_render_max", 4L))
}

board_section_max_chars <- function() {
  as.integer(blockr_option("assistant_board_section_max_chars", 1500L))
}

description_max_chars <- function() {
  as.integer(blockr_option("assistant_description_max_chars", 1000L))
}

skill_description_max_chars <- function() {
  as.integer(blockr_option("assistant_skill_description_max_chars", 1024L))
}

skill_catalogue_max_chars <- function() {
  as.integer(blockr_option("assistant_skill_catalogue_max_chars", 4000L))
}

block_tool_pool_size <- function() {
  as.integer(blockr_option("assistant_block_tool_pool", 20L))
}
