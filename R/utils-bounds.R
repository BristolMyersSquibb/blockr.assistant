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

is_whole_bound <- function(x, min) {
  is.numeric(x) && is_scalar(x) && !is.na(x) && x >= min &&
    (is.infinite(x) || isTRUE(x == trunc(x)))
}

summary_max_chars <- function() {
  as.integer(blockr_option("assistant_summary_max_chars", 2000L))
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
