# A block's live state, not the values it was constructed with.
#
# The block object on `board$board` is written once, at construction, and never
# rebuilt: `apply_board_update.board` handles blocks `add` and `rm`, and the
# only field a `mod` copies back is `block_name` (blockr.core board-server.R,
# `apply_block_mod_delta`). Everything else a user changes in the gear, and
# everything modify_block writes, lands in the block server's `state`
# reactives and stays there. So `format(block)` -- which reads the
# constructor's environment via `initial_block_state()` -- describes the block
# as it was at board load, however long ago that was.
#
# This is the same read `serialize_board.board()` performs to save a board
# (blockr.core plugin-serdes.R): the values that go on disk are these, not the
# constructor's.
block_current_state <- function(board, id) {

  blk <- isolate(board$blocks)[[id]]

  if (is.null(blk) || !length(blk$server$state)) {
    # Never built (deferred construction, off-screen) or stateless. Both are
    # legitimate; `blockr_ser.blocks` documents the same partial snapshot.
    return(NULL)
  }

  lapply(
    blk$server$state,
    function(rv) tryCatch(reval_if(rv), error = function(e) NULL)
  )
}

# Render state values for the prompt.
#
# NOT `utils::str()`, which format.block uses: it truncates a long character
# value ('"# only the four-cylinder cars"| __truncated__'). For a code block
# the one value that matters IS a long character value, and a model that gets
# a truncated script rewrites the block from scratch rather than editing it.
# Multi-line strings are printed in full and indented; the caller's
# truncate_chars() still bounds the whole description.
format_block_state <- function(state) {

  if (!length(state)) {
    return("Stateless block")
  }

  chr_ply(
    names(state),
    function(nm) {

      val <- state[[nm]]

      if (is.character(val) && length(val) == 1L && grepl("\n", val)) {
        return(
          paste(
            c(
              glue::glue("  {nm}:"),
              paste0("    ", strsplit(val, "\n", fixed = TRUE)[[1]])
            ),
            collapse = "\n"
          )
        )
      }

      one <- paste(
        trimws(utils::capture.output(utils::str(val, give.head = TRUE))),
        collapse = " "
      )

      glue::glue("  {nm}: {one}")
    }
  )
}

# Splice the live values into format.block()'s output, in place of its
# "Initial block state:" section. format.block() always emits a "Constructor:"
# line after that section, which is what bounds it.
splice_block_state <- function(lines, state) {

  beg <- match("Initial block state:", lines)

  if (is.na(beg)) {
    return(lines)
  }

  end <- utils::head(which(startsWith(lines, "Constructor:")), 1L)

  if (!length(end) || end <= beg) {
    return(lines)
  }

  c(
    lines[seq_len(beg - 1L)],
    "Current block state:",
    format_block_state(state),
    lines[seq(end, length(lines))]
  )
}
