register_commit_tool <- function(client, perform) {

  client$register_tool(tool_commit(perform))

  invisible(client)
}

tool_commit <- function(perform) {

  ellmer::tool(
    function() with_tool_errors("commit", perform()),
    name = "commit",
    description = paste(
      "Apply everything you have staged this turn to the board as one",
      "atomic update, wait for the touched blocks to re-evaluate, and",
      "return their results together with any new problems. This is your",
      "read-act-observe step: stage a coherent unit of work with the",
      "mutation tools, then commit to see what it produced and correct it",
      "if needed. Call it as a separate step after staging, once per",
      "coherent unit -- not after every single change. A no-op if nothing",
      "is staged."
    )
  )
}

commit_header <- function() {
  paste(
    "[Result of your commit -- the staged changes are now applied.] Check",
    "each changed block is what the user asked for; correct it and commit",
    "again if not."
  )
}

commit_reject_header <- function() {
  paste(
    "[Your commit was rejected -- the board was not changed.] Fix the",
    "problem and commit again."
  )
}

commit_clean_note <- function() {
  paste(
    "[Result of your commit -- the staged changes are now applied.] No",
    "block results or new problems to report."
  )
}

backstop_header <- function() {
  paste(
    "[You ended your turn with staged changes you had not committed; they",
    "were applied automatically.] Next time call commit yourself so you can",
    "review before ending your turn. Check the result below and correct it",
    "if needed."
  )
}

commit_timeout_secs <- function() {
  as.numeric(blockr_option("assistant_commit_timeout_secs", 30))
}

commit_timeout_note <- function() {
  paste(
    "[Result of your commit -- the changes were applied.] The touched",
    "blocks did not finish evaluating within the time limit; they may still",
    "be computing. Check a specific block with get_block_result or",
    "query_data, or continue and re-check shortly."
  )
}
