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
    "it. State is reported only where it is not an echo of what you sent: a",
    "block you added carries the full state its constructor resolved, and a",
    "block you modified carries only the fields whose applied value differs",
    "from what you staged. Read those closely, since a result summary on its",
    "own need not distinguish a change that landed from one that did not.",
    "Where no state is reported, the block holds exactly what you staged.",
    "Inspect downstream results with get_block_result or query_data when:",
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

no_staged_changes <- function() {
  list(add = character(), mod = list())
}

# What a commit staged for each block it changed, split by verb: the ids it
# adds, and the deltas it stages for the ones it modifies. The read-back needs
# the deltas and not merely the ids, because the two verbs carry different
# news -- see applied_state_lines().
staged_changes <- function(upd) {

  if (is.null(upd)) {
    return(no_staged_changes())
  }

  list(
    add = coal(names(upd$blocks$add), character()),
    mod = coal(upd$blocks$mod, list())
  )
}

# A commit is one atomic update, so this normally folds in a single set. It is
# the counterpart of the union() the touched ids get, for a flush that arrives
# in more than one piece; the newer delta wins, being the later staging.
merge_staged_changes <- function(prev, new) {

  list(
    add = union(prev$add, new$add),
    mod = c(prev$mod[setdiff(names(prev$mod), names(new$mod))], new$mod)
  )
}

changed_blocks <- function(upd) {

  chg <- staged_changes(upd)

  c(chg$add, names(chg$mod))
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

collect_touched_results <- function(touched, board,
                                    changed = no_staged_changes(),
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
  ids <- intersect(union(ids, neighbor_blocks(ids, board)), names(blks))

  shown <- ids[seq_len(min(cap, length(ids)))]

  lines <- chr_ply(
    shown, review_result_line, board, changed, use_names = FALSE
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

review_result_line <- function(id, board, changed) {

  paste(
    c(
      glue::glue("- {id}:"),
      applied_state_lines(id, board, changed),
      block_result_summary(id, board)
    ),
    collapse = "\n"
  )
}

# State is worth reading back only where it is not an echo of what the model
# just sent. Core applies a `blocks$mod` delta by writing each field straight
# into the block's state reactive value, with no validation and no revert, so
# an applied value is the staged one unless something else moved it -- the
# block's own client writing back over it, or an apply that stopped partway.
# Those fields are the news, and a modification carrying none reports no state
# at all. An addition is the opposite case: the constructor resolves every
# argument the model did not name, so the whole state is news.
applied_state_lines <- function(id, board, changed) {

  # Read live state rather than summary_block_state(), because divergence has
  # to be judged on the values as the board holds them: an elided long value
  # differs from every delta it could be compared against.
  state <- live_block_state(id, board)

  if (is.null(state)) {
    return(NULL)
  }

  header <- "Applied state:"

  if (id %in% names(changed$mod)) {

    state  <- diverged_state(state, changed$mod[[id]])
    header <- "Applied state (differs from what you staged):"

  } else if (!id %in% changed$add) {

    return(NULL)
  }

  if (!length(state)) {
    return(NULL)
  }

  # Elided as describe_block's state section is elided: this reads back a
  # change the model is about to confirm or correct, so a value shown in part
  # here is acted on exactly as one shown in part there. Rendered as core
  # renders block state for describe_block, so the model meets a block's
  # arguments in one shape wherever it reads them.
  rendered <- str_lines(elide_long_values(state))[-1L]

  c(
    header,
    truncate_chars(
      paste(rendered, collapse = "\n"), summary_max_chars(),
      hint = state_tool_hint()
    )
  )
}

# Compared with identical() because that is how core decides whether to write
# a delta field at all, so a field is reported exactly when core's write did
# not stick. A field the delta names but state does not hold is skipped rather
# than reported as diverged: `block_name` arrives that way, core applying it
# to the board's block object rather than to state.
diverged_state <- function(state, delta) {

  nms <- intersect(names(delta), names(state))

  state[nms[!lgl_mply(identical, state[nms], delta[nms])]]
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
