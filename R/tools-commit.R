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
      "return their results, any new problems, and the resolved state of",
      "any block you added. This is your read-act-observe step: stage a",
      "coherent unit of work with the mutation tools, then commit to see",
      "what it produced and correct it if needed. Call it as a separate",
      "step after staging, once per coherent unit -- not after every",
      "single change. Always resolve a turn's staged changes before ending",
      "the turn: commit them here, or discard to drop them. A no-op if",
      "nothing is staged."
    )
  )
}

register_discard_tool <- function(client, pending) {

  client$register_tool(tool_discard(pending))

  invisible(client)
}

tool_discard <- function(pending) {

  ellmer::tool(
    function() {
      with_tool_errors("discard", {

        if (has_any_changes(isolate(pending()))) {

          reset_pending(pending)
          "Discarded all staged changes; the board is unchanged."

        } else {

          "Nothing is staged to discard."
        }
      })
    },
    name = "discard",
    description = paste(
      "Drop everything you have staged this turn without applying it, leaving",
      "the board unchanged. Use this to abandon staged changes you no longer",
      "want. A no-op if nothing is staged."
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

# Only a `validate` rejection is recorded before core touches anything. An
# `apply` one is thrown from partway through a sequence of separate mutations
# that has no rollback, so the board may already carry part of the update --
# and any phase that is not `validate` is treated that way.
commit_reject_header <- function(phase) {

  if (identical(phase, "validate")) {
    return(
      paste(
        "[Your commit was rejected -- the board was not changed.] Fix the",
        "problem and commit again."
      )
    )
  }

  paste(
    "[Your commit stopped partway -- the board may be partly updated.] Read",
    "back what landed before you commit again, so you neither re-apply a",
    "change that already took nor leave a half-applied board alone."
  )
}

commit_clean_note <- function() {
  paste(
    "[Result of your commit -- the staged changes are now applied.] No",
    "block results or new problems to report."
  )
}

uncommitted_nudge <- function() {
  paste(
    "[You ended your turn with staged changes you never committed. Nothing",
    "has been applied.] Resolve them now: call commit to apply them and read",
    "back the results, or discard to drop them. Staged changes are not",
    "applied to the board, and are dropped if you leave them unresolved."
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
