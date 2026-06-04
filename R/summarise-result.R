# Project a block's evaluated result into bounded prompt text for the
# get_block_result tool, via btw::btw_this() (data frames, tibbles,
# matrices, truncated print() fallback). btw_this() truncates
# aggressively, keeping output to roughly 1-2 KB. Internal to the read
# tools.
summarise_result <- function(x, ...) {
  as.character(btw::btw_this(x, ...))
}
