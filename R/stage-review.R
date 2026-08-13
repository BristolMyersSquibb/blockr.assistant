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
      sprintf(
        paste(
          "The board update was rejected during the %s phase and the board",
          "was not changed: %s"
        ),
        outcome$phase, outcome$message
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
    "it. Inspect downstream results with get_block_result or query_data when:",
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

touched_blocks <- function(upd, board) {

  if (is.null(upd)) {
    return(character())
  }

  changed <- c(names(upd$blocks$add), names(upd$blocks$mod))

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

  lines <- chr_ply(shown, review_result_line, board, use_names = FALSE)

  if (length(ids) > length(shown)) {
    lines <- c(
      lines,
      sprintf(
        paste(
          "(showing %d of %d blocks -- call get_block_result or",
          "query_data for the rest)"
        ),
        length(shown), length(ids)
      )
    )
  }

  c("Results of the blocks you changed and the blocks linked to them:", lines)
}

review_result_line <- function(id, board) {
  sprintf("- %s:\n%s", id, block_result_summary(id, board))
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
