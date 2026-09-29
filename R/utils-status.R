eval_status <- function(id, board) {
  coal(isolate(reval_if(board$eval[[id]])), NA_character_)
}

# One gloss per eval status under which a block has no result to read. A
# `ready` block (and a block carrying no status at all) is deliberately absent,
# so membership here doubles as the has_no_result() predicate. Core holds on to
# a `stale` block's last result, but that result is out of date, so it is not
# one to read either.
eval_status_notes <- function() {
  c(
    unevaluated = paste(
      "off screen and not evaluated yet -- holding no result is the board",
      "deferring work nothing on screen needs, not a failure, and not",
      "something to reconfigure over"
    ),
    stale = paste(
      "off screen and not re-evaluating, and something its last evaluation",
      "read has changed since -- its arguments, its incoming links or an",
      "upstream result -- so the last result is out of date"
    ),
    waiting = paste(
      "waiting on a data input -- an incoming link is missing, or an upstream",
      "block is not itself ready"
    ),
    unset = "waiting on a required argument value that has not been set",
    failed = "evaluation raised -- call get_block_conditions for the error"
  )
}

has_no_result <- function(status) {
  status %in% names(eval_status_notes())
}

# The two statuses under which what a block reports -- result, conditions --
# is not a check against what it reads now. Any other status is current
# whether or not the block is on screen: an off-screen block keeps what its
# last check found until something that check read changes, and then reads
# `stale`.
eval_deferred <- function(status) {
  status %in% c("stale", "unevaluated")
}

eval_status_note <- function(status) {
  if (has_no_result(status)) eval_status_notes()[[status]] else NULL
}

eval_status_marker <- function(id, board) {

  status <- eval_status(id, board)

  if (has_no_result(status)) glue::glue("[{status}]") else ""
}

eval_status_line <- function(status) {

  if (is.na(status)) {
    return(NULL)
  }

  paste(
    c(glue::glue("Eval status: {status}"), eval_status_note(status)),
    collapse = " -- "
  )
}

block_markers <- function(board) {

  conds <- block_condition_markers(board)

  if (!length(conds)) {
    return(conds)
  }

  ids <- names(conds)

  set_names(
    trimws(paste(chr_ply(ids, eval_status_marker, board), conds)),
    ids
  )
}

no_result_message <- function(id, status, err = NULL) {

  note <- eval_status_note(status)

  if (not_null(note)) {
    return(
      glue::glue("Block {id} has no result to read (`{status}`): {note}.")
    )
  }

  msg <- if (is.null(err)) "" else conditionMessage(err)

  if (nzchar(msg)) {
    glue::glue("Block {id} has not evaluated successfully: {msg}")
  } else {
    glue::glue("Block {id} has not evaluated and reports no reason.")
  }
}

deferred_conditions_caveat <- function(id, status) {

  if (!eval_deferred(status)) {
    return(NULL)
  }

  lead <- if (identical(status, "stale")) {
    glue::glue(
      "These are block {id}'s conditions as of its last evaluation. It is ",
      "`stale` -- off screen and not re-evaluating -- and something it read ",
      "has changed since, so they may not reflect what it would raise now."
    )
  } else {
    glue::glue(
      "Block {id} is `unevaluated` -- off screen and not evaluated yet -- so ",
      "it has had no chance to raise anything."
    )
  }

  paste(
    lead,
    "Read an empty report as unknown rather than as an all-clear: a problem",
    "will not surface until the block is evaluated."
  )
}

skipped_block_lines <- function(status) {

  # Give a missing status a name of its own: split() drops the NA group, which
  # would lose the block from the report entirely.
  status[is.na(status)] <- "unknown"

  by_status <- split(names(status), status)

  c(
    "Skipped blocks -- no result to bind:",
    chr_mply(skipped_status_line, by_status, names(by_status))
  )
}

skipped_status_line <- function(ids, status) {

  note <- eval_status_note(status)
  blocks <- paste(ids, collapse = ", ")

  if (is.null(note)) {
    return(glue::glue("- {blocks}: no result available"))
  }

  glue::glue("- {blocks} (`{status}`): {note}")
}
