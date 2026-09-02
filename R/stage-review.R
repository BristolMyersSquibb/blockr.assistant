added_conditions <- function(baseline, current) {

  seen <- paste(baseline$block, baseline$id, sep = "\r")

  current[
    !paste(current$block, current$id, sep = "\r") %in% seen, ,
    drop = FALSE
  ]
}

format_flush_feedback <- function(outcome, conditions = NULL, results = NULL,
                                  header = flush_check_header()) {

  parts <- character()

  if (!is.null(outcome) && isFALSE(outcome$ok)) {
    parts <- c(
      parts,
      glue::glue(
        "The board update was rejected during the {outcome$phase} phase ",
        "and the board was not changed: {outcome$message}"
      )
    )
  }

  if (length(results)) {
    parts <- c(parts, paste(results, collapse = "\n"), review_invitation())
  }

  if (!is.null(conditions) && nrow(conditions)) {
    by_block <- split(conditions, conditions$block)
    parts <- c(
      parts,
      "After applying your changes, some blocks now report problems:",
      chr_mply(format_conditions, by_block, names(by_block))
    )
  }

  if (!length(parts)) {
    return(NULL)
  }

  paste(c(header, parts), collapse = "\n\n")
}

flush_check_header <- function() {
  paste(
    "[Automatic board check after applying your changes.] Correct the",
    "problem if it was unintended, or briefly confirm if the result is",
    "expected."
  )
}

review_invitation <- function() {
  paste(
    "Confirm each changed block matches what the user asked for, or correct",
    "it. State is reported for a block you added, whose constructor resolves",
    "every argument you did not name; a block you modified holds what you",
    "staged, so it carries no state section. Inspect downstream results with",
    "get_block_result or query_data when:",
    "a problem is reported below; you are unsure how a change propagates; or",
    "you made an upstream change (a column rename or removal, a new filter, a",
    "type change) that downstream blocks may depend on."
  )
}

link_dests <- function(lnks) {

  if (!length(lnks)) {
    return(character())
  }

  as.data.frame(lnks)$to
}

changed_blocks <- function(upd) {

  if (is.null(upd)) {
    return(character())
  }

  c(names(upd$blocks$add), names(upd$blocks$mod))
}

# The blocks whose state a commit reads back: the added ones only. Core applies
# a `blocks$mod` delta by writing each field straight into the block's state
# reactive value, with no validation and no revert, and nothing that could move
# it back is observable by the time the read-back is taken -- so reporting a
# modification would hand the model the delta it had just sent. An addition is
# the case that carries news, its constructor resolving every argument the
# model did not name.
added_blocks <- function(upd) {

  if (is.null(upd)) {
    return(character())
  }

  coal(names(upd$blocks$add), character())
}

touched_blocks <- function(upd, board) {

  if (is.null(upd)) {
    return(character())
  }

  changed <- changed_blocks(upd)

  committed <- as.data.frame(board_links(board))

  dest_of <- function(ids) {

    if (!length(ids) || !nrow(committed)) {
      return(character())
    }

    committed$to[committed$id %in% ids]
  }

  mod_new <- if (length(upd$links$mod)) {
    chr_ply(
      upd$links$mod,
      function(d) coal(d$to, NA_character_),
      use_names = FALSE
    )
  } else {
    character()
  }

  unique(
    c(
      changed,
      link_dests(upd$links$add),
      dest_of(upd$links$rm),
      dest_of(names(upd$links$mod)),
      mod_new[!is.na(mod_new)]
    )
  )
}

review_max_blocks <- function() {
  as.integer(blockr_option("assistant_review_max_blocks", 50L))
}

collect_touched_results <- function(touched, board, added = character(),
                                    cap = review_max_blocks()) {

  blks <- isolate(board$blocks)
  ids  <- intersect(touched, names(blks))

  if (!length(ids)) {
    return(NULL)
  }

  # Report the touched blocks together with their immediate neighbours -- the
  # blocks feeding them and the blocks they feed. To judge whether a block
  # built the right thing (or why it errored or came back empty) the model
  # needs its inputs; to see whether the change propagated it needs its
  # consumers. Touched blocks lead so the cap spends its budget on them first;
  # per-result size is bounded in summarise_result(), so the worst-case review
  # is `cap` blocks times that per-result bound.
  changed <- ids

  ids <- intersect(union(ids, neighbor_blocks(ids, board)), names(blks))

  shown <- ids[seq_len(min(cap, length(ids)))]

  lines <- chr_ply(
    shown, review_result_line, board, added, changed, use_names = FALSE
  )

  if (length(ids) > length(shown)) {
    lines <- c(
      lines,
      glue::glue(
        "(showing {length(shown)} of {length(ids)} blocks -- call ",
        "get_block_result or query_data for the rest)"
      )
    )
  }

  c("Results of the blocks you changed and the blocks linked to them:", lines)
}

review_result_line <- function(id, board, added, changed = character()) {

  paste(
    c(
      glue::glue("- {id}:"),
      if (id %in% added) applied_state_lines(id, board),
      block_result_summary(id, board),
      if (id %in% changed) unverified_note(id, board)
    ),
    collapse = "\n"
  )
}

# The gloss no_result_message() puts on a status with no result -- `dormant` is
# "the deferral, not a failure, and not something to reconfigure over" -- is
# right when the model browses a block it had nothing to do with, and wrong
# here. This block is one it just changed, and the commit claimed it, so if it
# still has no result the change is unverified rather than fine. The model read
# the browse gloss as an all-clear and reported a table it had never seen.
unverified_note <- function(id, board) {

  if (!has_no_result(eval_status(id, board))) {
    return(NULL)
  }

  paste(
    "You changed this block and it produced no result to check, so what you",
    "built here is UNVERIFIED. Do not report it as done: say what is",
    "unverified, or get the block into a state where it evaluates."
  )
}

applied_state_lines <- function(id, board) {

  # Elided as describe_block's state section is elided: this reads back a
  # change the model is about to confirm or correct, so a value shown in part
  # here is acted on exactly as one shown in part there.
  state <- summary_block_state(id, board)

  if (is.null(state)) {
    return(NULL)
  }

  # Rendered as core renders block state for describe_block, so the model
  # meets a block's arguments in one shape wherever it reads them.
  rendered <- str_lines(state)[-1L]

  c(
    "Applied state:",
    truncate_chars(
      paste(rendered, collapse = "\n"), summary_max_chars(),
      hint = state_tool_hint()
    )
  )
}

neighbor_blocks <- function(ids, board) {

  brd <- isolate(board$board)

  if (is.null(brd)) {
    return(character())
  }

  lnks <- as.data.frame(board_links(brd))

  if (!nrow(lnks)) {
    return(character())
  }

  unique(c(lnks$from[lnks$to %in% ids], lnks$to[lnks$from %in% ids]))
}

# --- the commit's claim over the blocks it touched ---------------------------

# A block the model changed on a tab nobody is looking at is `dormant`: core
# does not evaluate it, so it raises nothing, so the commit reads back clean
# and the model reports a table it has never seen. Claiming the touched blocks
# for the length of the read-back is what closes that gap -- see the Evaluation
# requests section of blockr.core::board_server().
#
# `sustain`, not `evaluate`. Both put an off-screen block into the eval set,
# but `evaluate` is a one-off core drops the moment the block has run, so the
# block is back to `dormant` by the time the review reads it: an error survives
# (conditions persist) while a result does not. A claim held across the
# read-back gives the model both, and holding it past the review keeps a
# follow-up get_block_result from answering `dormant` for a block the model
# just built.
commit_claim_ids <- function(payload, board) {

  if (is.null(payload)) {
    return(character())
  }

  # `sustain` `set` resolves against the POST-update block set, so a block this
  # payload removes cannot be claimed -- core would reject the payload whole.
  setdiff(touched_blocks(payload, board), coal(payload$blocks$rm, character()))
}

commit_claim_owner <- function() {
  "blockr.assistant"
}

commit_claim <- function(ids) {
  list(set = ids)
}

# Stating the owner's whole set, so each commit's claim replaces the one
# before it rather than accumulating, and an empty set releases.
commit_claim_delta <- function(ids) {
  set_names(list(commit_claim(ids)), commit_claim_owner())
}

# Whether the claimed blocks have got far enough to be worth reading. A block
# still `dormant` or `stale` has not run under the claim yet, and reading it
# now returns the same nothing the single-flush review used to. Anything else
# -- `ready`, `failed`, `waiting`, `unset` -- is a settled verdict the review
# can report.
commit_settled <- function(ids, board) {

  if (!length(ids)) {
    return(TRUE)
  }

  # eval_status() under a reactive read rather than an isolated one: the
  # observer waiting on the claim has to re-run as each claimed block's status
  # advances, and reading the container live is also what wakes it when a block
  # the payload ADDED is constructed and gets a status for the first time.
  status <- board$eval

  # Nothing to wait on: a board that reports no statuses at all cannot say
  # whether the claim ran, and holding the commit open to its timeout on every
  # call would be worse than reviewing early. Core always has the container.
  if (is.null(status)) {
    return(TRUE)
  }

  !any(lgl_ply(ids, function(id) eval_deferred(claim_status(status, id))))
}

# A claimed block with no status yet reads as `dormant` -- unsettled, one still
# on its way in -- and the commit timeout is what bounds that wait.
claim_status <- function(status, id) {
  coal(reval_if(status[[id]]), "dormant")
}
