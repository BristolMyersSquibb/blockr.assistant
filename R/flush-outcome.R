added_conditions <- function(baseline, current) {

  seen <- paste(baseline$block, baseline$id, sep = "\r")

  current[
    !paste(current$block, current$id, sep = "\r") %in% seen, ,
    drop = FALSE
  ]
}

format_flush_feedback <- function(outcome, conditions = NULL, results = NULL) {

  parts <- character()

  if (!is.null(outcome) && isFALSE(outcome$ok)) {
    parts <- c(
      parts,
      sprintf(
        paste(
          "The board update from your last turn was rejected during the %s",
          "phase and the board was not changed: %s"
        ),
        outcome$phase, outcome$message
      )
    )
  }

  if (length(results)) {
    parts <- c(parts, paste(results, collapse = "\n"), review_invitation())
  }

  noop_ids <- attr(results, "noop_ids")

  if (length(noop_ids)) {
    parts <- c(
      parts,
      sprintf(
        paste(
          "These blocks applied VALIDLY but left their data unchanged (a",
          "no-op): %s. A valid change that does nothing usually means a",
          "wrong column name or filter value. Follow the effect hint,",
          "inspect the real values with query_data, and fix it -- or state",
          "explicitly that the no-op is intended."
        ),
        toString(noop_ids)
      )
    )
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

  paste(
    c(
      paste(
        "[Automatic board check after applying your changes.] Correct the",
        "problem if it was unintended, or briefly confirm if the result is",
        "expected."
      ),
      parts
    ),
    collapse = "\n\n"
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
  touched_ids <- ids
  ids <- intersect(union(ids, neighbor_blocks(ids, board)), names(blks))

  shown <- ids[seq_len(min(cap, length(ids)))]

  effects <- chr_ply(shown, block_effect_line, board)
  names(effects) <- shown

  lines <- chr_ply(
    shown,
    function(id) {

      res <- tryCatch(
        isolate(blks[[id]]$server$result()),
        error = function(e) e
      )

      body <- if (inherits(res, "error")) {
        paste(
          "(no result: the block has not evaluated successfully -- if no",
          "condition is reported below it may simply not have run yet;",
          "check again with get_block_result)"
        )
      } else if (is.null(res)) {
        paste(
          "(NULL result -- normal for display blocks, whose value is the",
          "rendered output. You CANNOT verify a display block from its",
          "result: verify that every column it is configured with exists",
          "in its upstream input below, via describe_block + the upstream",
          "summary.)"
        )
      } else {
        paste(summarise_result(res), collapse = "\n")
      }

      eff <- effects[[id]]

      sprintf(
        "- %s:%s\n%s",
        id,
        if (nzchar(eff)) paste0(" [", eff, "]") else "",
        body
      )
    },
    use_names = FALSE
  )

  noop_ids <- intersect(touched_ids, shown)
  noop_ids <- noop_ids[
    vapply(effects[noop_ids], effect_is_noop, logical(1L))
  ]

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

  structure(
    c("Results of the blocks you changed and the blocks linked to them:", lines),
    noop_ids = noop_ids
  )
}

# Effect of a block on its data: rows/cols diff of its (first) upstream input
# vs its result, via blockr.ai::data_effect. "" when not computable -- source
# blocks, display results, or blockr.ai not installed. The effect is the cheap
# deterministic "did it actually do something" signal; a bare "ok" cannot
# distinguish a working filter from one that matched nothing.
block_effect_line <- function(id, board) {

  if (!requireNamespace("blockr.ai", quietly = TRUE)) {
    return("")
  }

  tryCatch(
    {
      blks <- isolate(board$blocks)

      res <- isolate(blks[[id]]$server$result())

      lnks <- as.data.frame(board_links(isolate(board$board)))
      from <- lnks$from[lnks$to == id]

      if (!length(from) || !from[[1L]] %in% names(blks)) {
        return("")
      }

      input <- isolate(blks[[from[[1L]]]]$server$result())

      eff <- blockr.ai::data_effect(input, res)

      if (!nzchar(eff)) "" else paste0("effect vs input: ", eff)
    },
    error = function(e) ""
  )
}

# Same sentinels blockr.ai's harness greps for: a bare row-count "UNCHANGED"
# is NOT a no-op (a same-row transform that adds a column is effective); only
# the explicit whole-diff sentinels count.
effect_is_noop <- function(effect) {
  nzchar(effect) && grepl(
    "no rows or columns changed|not populated|degenerate",
    effect,
    ignore.case = TRUE
  )
}

# blockr.ai's `no_config` failure, board flavor: the model narrates future
# action ("Next, I'll add the blocks ...") but stages nothing, and the turn
# would end silently. Deliberately narrow -- unambiguous future commitments
# plus a build verb -- so answering a question or asking one never trips it.
promises_action <- function(reply) {

  if (!is.character(reply) || length(reply) != 1L || !nzchar(reply)) {
    return(FALSE)
  }

  grepl(
    paste0(
      "(?i)\\b(",
      "i('ll| will) (now )?(add|build|create|wire|pull|extract|compute|",
      "set up|configure)",
      "|next step, i|next, i('ll| will)",
      "|let me (add|build|create|set up)",
      ")"
    ),
    reply,
    perl = TRUE
  )
}

no_progress_feedback <- function() {
  paste(
    "[Automatic check] Your reply describes actions you would take, but you",
    "staged no changes -- NOTHING was applied to the board. Do not describe;",
    "build. If you have what you need, make the add_block / add_link /",
    "modify_block calls NOW, in this turn, choosing sensible defaults and",
    "stating them briefly. Only stop to ask when a decision is genuinely",
    "impossible to default."
  )
}

# After two consecutive rounds that still leave problems on the board, a
# third near-identical attempt is the dominant stuck pattern (blockr.ai's
# surrender finding). Redirect: inspect the actual value, or escalate with
# the verbatim error instead of claiming the task is impossible.
surrender_guidance <- function(error = NULL) {
  paste(
    c(
      paste(
        "[Strategy note] This is at least your second consecutive attempt",
        "that did not produce a clean board. Do NOT re-stage a",
        "near-identical change. Instead: (1) inspect the exact value the",
        "problem names with query_data (str(), unique(), head() of the real",
        "upstream data); (2) reconsider the block type or the wiring; (3) if",
        "you cannot make it work, STOP, report the verbatim error to the",
        "user, and ask ONE specific question that unblocks you."
      ),
      if (!is.null(error)) paste("Verbatim error:", error)
    ),
    collapse = " "
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
