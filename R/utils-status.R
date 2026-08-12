eval_status <- function(id, board) {
  coal(isolate(reval_if(board$eval[[id]])), NA_character_)
}

# One gloss per eval status under which a block has no result to read. A
# `ready` block (and a block carrying no status at all) is deliberately absent,
# so membership here doubles as the has_no_result() predicate.
eval_status_notes <- function() {
  c(
    dormant = paste(
      "off screen and not currently evaluated -- normal for a block the user",
      "is not looking at, and not a problem to fix"
    ),
    stale = paste(
      "off screen and not currently evaluated, and an upstream block has",
      "produced a new result since the last evaluation, so the last result is",
      "out of date"
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

eval_status_note <- function(status) {
  if (has_no_result(status)) eval_status_notes()[[status]] else NULL
}

eval_status_marker <- function(id, board) {

  status <- eval_status(id, board)

  if (has_no_result(status)) sprintf("[%s]", status) else ""
}

eval_status_line <- function(status) {

  if (is.na(status)) {
    return(NULL)
  }

  paste(
    c(sprintf("Eval status: %s", status), eval_status_note(status)),
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
      sprintf("Block %s has no result to read (`%s`): %s.", id, status, note)
    )
  }

  msg <- if (is.null(err)) "" else conditionMessage(err)

  if (nzchar(msg)) {
    sprintf("Block %s has not evaluated successfully: %s", id, msg)
  } else {
    sprintf("Block %s has not evaluated and reports no reason.", id)
  }
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
    return(sprintf("- %s: no result available", blocks))
  }

  sprintf("- %s (`%s`): %s", blocks, status, note)
}
