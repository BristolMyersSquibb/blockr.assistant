empty_pending <- function() {

  list(
    blocks = list(
      add = blocks(),
      mod = list(),
      rm  = character()
    ),
    links = list(
      add = links(),
      mod = list(),
      rm  = character()
    ),
    stacks = list(
      add = stacks(),
      mod = list(),
      rm  = character()
    ),
    views = list(
      add    = list(),
      mod    = list(),
      rm     = character(),
      active = NULL,
      rename = list()
    ),
    extensions = list(
      mod = list()
    )
  )
}

merge_args <- function(prev, new) {

  if (!length(prev)) {
    return(new)
  }

  if (!length(new)) {
    return(prev)
  }

  prev[names(new)] <- new
  prev
}

reset_pending <- function(pending) {

  pending(empty_pending())
  invisible()
}

has_any_changes <- function(payload) {

  views_active <- !is.null(payload$views$active)

  any(
    lengths(payload$blocks) > 0L,
    lengths(payload$links)  > 0L,
    lengths(payload$stacks) > 0L,
    length(payload$views$add) > 0L,
    length(payload$views$mod) > 0L,
    length(payload$views$rm)  > 0L,
    length(payload$views$rename) > 0L,
    length(payload$extensions$mod) > 0L,
    views_active
  )
}

format_stage_error <- function(op, id, e) {

  msg <- if (inherits(e, "condition")) {
    conditionMessage(e)
  } else {
    as.character(e)
  }

  glue::glue("{op}({id}) failed: {msg}")
}

stage_abort <- function(op, id, reason) {
  stop(format_stage_error(op, id, reason), call. = FALSE)
}

validate_pending <- function(payload, board) {
  validate_board_update(payload, board)
}

commit_pending <- function(pending, board, proposed, op, id) {

  tryCatch(
    validate_pending(proposed, board),
    error = function(e) stage_abort(op, id, e)
  )

  pending(proposed)
  invisible(TRUE)
}

stage_block_add <- function(pending, board, id, block) {

  cur <- isolate(pending())

  if (id %in% names(cur$blocks$add)) {
    stage_abort("add_block", id, "id is already staged for creation")
  }

  if (id %in% names(cur$blocks$mod)) {
    stage_abort(
      "add_block", id,
      "id is on the board and staged for modification; use modify_block"
    )
  }

  if (id %in% cur$blocks$rm) {
    stage_abort(
      "add_block", id,
      "id is staged for removal; use modify_block instead"
    )
  }

  new <- cur
  new$blocks$add <- c(new$blocks$add, set_names(blocks(block), id))

  commit_pending(pending, isolate(board$board), new, "add_block", id)
}

stage_block_mod <- function(pending, board, id, delta) {

  cur <- isolate(pending())

  if (id %in% names(cur$blocks$add)) {
    stage_abort(
      "modify_block", id,
      paste0(
        id, " is staged for creation this turn. Use remove_block(\"",
        id, "\") followed by add_block(<type>, <args>, id = \"", id,
        "\") with the corrected arguments."
      )
    )
  }

  if (id %in% cur$blocks$rm) {
    stage_abort(
      "modify_block", id,
      "id is staged for removal; mod has no effect"
    )
  }

  new <- cur

  if (id %in% names(cur$blocks$mod)) {

    new$blocks$mod[[id]] <- merge_args(cur$blocks$mod[[id]], delta)

  } else {

    new$blocks$mod <- c(new$blocks$mod, set_names(list(delta), id))
  }

  commit_pending(pending, isolate(board$board), new, "modify_block", id)
}

stage_block_rm <- function(pending, board, id) {

  cur <- isolate(pending())

  if (id %in% cur$blocks$rm) {
    stage_abort("remove_block", id, "id is already staged for removal")
  }

  new <- cur

  if (id %in% names(cur$blocks$add)) {

    new$blocks$add <- new$blocks$add[
      setdiff(names(new$blocks$add), id)
    ]

  } else {

    if (id %in% names(cur$blocks$mod)) {
      new$blocks$mod <- new$blocks$mod[
        setdiff(names(new$blocks$mod), id)
      ]
    }

    new$blocks$rm <- c(new$blocks$rm, id)
  }

  brd <- isolate(board$board)

  dropped <- staged_links_incident(new$links, id, brd)

  new$links$add <- new$links$add[setdiff(names(new$links$add), dropped)]
  new$links$mod <- new$links$mod[setdiff(names(new$links$mod), dropped)]

  new$stacks <- drop_staged_stack_member(new$stacks, id, brd)

  commit_pending(pending, brd, new, "remove_block", id)

  invisible(dropped)
}

# Core's augment_board_update() cascade only cleans links and stacks that are
# already on the board, and keys off blocks$rm -- so a reference wired up this
# same turn, or one wired to a staged-add block now being retracted, survives
# to point at a block that will not exist. validate_pending() then rejects the
# whole payload, and since commit_pending() writes nothing on failure, the
# removal is a silent no-op. We prune those staged references here, reusing
# core's update_link and update_stack to resolve a pending mod to the link or
# stack it produces.
staged_links_incident <- function(lnks, id, board) {

  incident <- function(x) x$from %in% id | x$to %in% id

  merged <- as_links(
    Map(update_link, board_links(board)[names(lnks$mod)], lnks$mod)
  )

  unique(
    c(names(lnks$add)[incident(lnks$add)], names(lnks$mod)[incident(merged)])
  )
}

drop_staged_stack_member <- function(stks, id, board) {

  without_id <- function(s) {

    if (id %in% stack_blocks(s)) {
      stack_blocks(s) <- setdiff(stack_blocks(s), id)
    }

    s
  }

  if (length(stks$add)) {
    stks$add <- as_stacks(
      set_names(lapply(stks$add, without_id), names(stks$add))
    )
  }

  for (sid in names(stks$mod)) {

    eff <- update_stack(board_stacks(board)[[sid]], stks$mod[[sid]])

    if (id %in% stack_blocks(eff)) {
      stks$mod[[sid]]$blocks <- setdiff(stack_blocks(eff), id)
    }
  }

  stks
}

stage_link_add <- function(pending, board, id, link) {

  cur <- isolate(pending())

  if (id %in% names(cur$links$add)) {
    stage_abort("add_link", id, "id is already staged for creation")
  }

  if (id %in% names(cur$links$mod)) {
    stage_abort(
      "add_link", id,
      "id is on the board and staged for modification; use modify_link"
    )
  }

  if (id %in% cur$links$rm) {
    stage_abort(
      "add_link", id,
      "id is staged for removal; use modify_link instead"
    )
  }

  new <- cur
  new$links$add <- c(new$links$add, set_names(links(link), id))

  commit_pending(pending, isolate(board$board), new, "add_link", id)
}

stage_link_mod <- function(pending, board, id, delta) {

  cur <- isolate(pending())

  if (id %in% names(cur$links$add)) {
    stage_abort(
      "modify_link", id,
      paste0(
        id, " is staged for creation this turn. Use remove_link(\"",
        id, "\") followed by add_link(...) with the corrected fields."
      )
    )
  }

  if (id %in% cur$links$rm) {
    stage_abort(
      "modify_link", id,
      "id is staged for removal; mod has no effect"
    )
  }

  new <- cur

  if (id %in% names(cur$links$mod)) {

    new$links$mod[[id]] <- merge_args(cur$links$mod[[id]], delta)

  } else {

    new$links$mod <- c(new$links$mod, set_names(list(delta), id))
  }

  commit_pending(pending, isolate(board$board), new, "modify_link", id)
}

stage_link_rm <- function(pending, board, id) {

  cur <- isolate(pending())

  if (id %in% cur$links$rm) {
    stage_abort("remove_link", id, "id is already staged for removal")
  }

  new <- cur

  if (id %in% names(cur$links$add)) {

    new$links$add <- new$links$add[
      setdiff(names(new$links$add), id)
    ]

  } else {

    if (id %in% names(cur$links$mod)) {
      new$links$mod <- new$links$mod[
        setdiff(names(new$links$mod), id)
      ]
    }

    new$links$rm <- c(new$links$rm, id)
  }

  commit_pending(pending, isolate(board$board), new, "remove_link", id)
}

stage_stack_add <- function(pending, board, id, stack) {

  cur <- isolate(pending())

  if (id %in% names(cur$stacks$add)) {
    stage_abort("add_stack", id, "id is already staged for creation")
  }

  if (id %in% names(cur$stacks$mod)) {
    stage_abort(
      "add_stack", id,
      "id is on the board and staged for modification; use modify_stack"
    )
  }

  if (id %in% cur$stacks$rm) {
    stage_abort(
      "add_stack", id,
      "id is staged for removal; use modify_stack instead"
    )
  }

  new <- cur
  new$stacks$add <- c(new$stacks$add, set_names(stacks(stack), id))

  commit_pending(pending, isolate(board$board), new, "add_stack", id)
}

stage_stack_mod <- function(pending, board, id, delta) {

  cur <- isolate(pending())

  if (id %in% names(cur$stacks$add)) {
    stage_abort(
      "modify_stack", id,
      paste0(
        id, " is staged for creation this turn. Use remove_stack(\"",
        id, "\") followed by add_stack(...) with the corrected fields."
      )
    )
  }

  if (id %in% cur$stacks$rm) {
    stage_abort(
      "modify_stack", id,
      "id is staged for removal; mod has no effect"
    )
  }

  new <- cur

  if (id %in% names(cur$stacks$mod)) {

    new$stacks$mod[[id]] <- merge_args(cur$stacks$mod[[id]], delta)

  } else {

    new$stacks$mod <- c(new$stacks$mod, set_names(list(delta), id))
  }

  commit_pending(pending, isolate(board$board), new, "modify_stack", id)
}

stage_stack_rm <- function(pending, board, id) {

  cur <- isolate(pending())

  if (id %in% cur$stacks$rm) {
    stage_abort("remove_stack", id, "id is already staged for removal")
  }

  new <- cur

  if (id %in% names(cur$stacks$add)) {

    new$stacks$add <- new$stacks$add[
      setdiff(names(new$stacks$add), id)
    ]

  } else {

    if (id %in% names(cur$stacks$mod)) {
      new$stacks$mod <- new$stacks$mod[
        setdiff(names(new$stacks$mod), id)
      ]
    }

    new$stacks$rm <- c(new$stacks$rm, id)
  }

  commit_pending(pending, isolate(board$board), new, "remove_stack", id)
}

stage_view_add <- function(pending, board, name, layout, active = FALSE) {

  cur <- isolate(pending())

  if (name %in% names(cur$views$add)) {
    stage_abort("add_view", name, "view is already staged for creation")
  }

  if (name %in% names(cur$views$mod)) {
    stage_abort(
      "add_view", name,
      "a view addressed by this id is already staged for panel changes"
    )
  }

  if (name %in% cur$views$rm) {
    stage_abort(
      "add_view", name,
      "a view addressed by this id is staged for removal; edit it in place"
    )
  }

  new <- cur
  new$views$add <- c(new$views$add, set_names(list(layout), name))

  if (isTRUE(active)) {
    new$views$active <- name
  }

  commit_pending(pending, isolate(board$board), new, "add_view", name)
}

# One atomic panel op (`add` / `rm` / `move`) stages a single verb entry into a
# view's slice of the `views$mod` panel-op grammar, keyed by the panel it names
# so a turn's ops on one view compose into a single delta. dock owns arrangement
# (the settled-echo grid mirror is its sole writer), so these are membership +
# placement-hint verbs, never a geometry write. `commit_pending()` augments and
# validates the whole batch against the board, surfacing an unknown view, a
# non-member removal or a stale placement anchor with dock's own error.
stage_view_panel_op <- function(pending, board, op, view, verb, ref) {

  cur <- isolate(pending())

  if (view %in% names(cur$views$add)) {
    stage_abort(
      op, view,
      "view is staged for creation this turn; set its panels via add_view"
    )
  }

  if (view %in% cur$views$rm) {
    stage_abort(op, view, "view is staged for removal; the op has no effect")
  }

  new <- cur
  new$views$mod[[view]] <- merge_panel_op(
    coal(cur$views$mod[[view]], list(), fail_all = FALSE), verb, ref
  )

  if (!length(new$views$mod[[view]])) {
    new$views$mod[[view]] <- NULL
  }

  commit_pending(pending, isolate(board$board), new, op, view)
}

# Fold a verb entry into a view's pending mod. `add` / `move` / `resize` / `rm`
# are keyed by panel id (a repeat op updates in place, last hint wins).
# `select` is a single-valued slot -- dock surfaces one focused panel per view,
# so a later focus on the same view replaces the earlier one. Removing a panel
# only added this turn cancels the pending add rather than staging a
# contradictory remove; a removal also drops any pending move, resize or select
# of that panel.
merge_panel_op <- function(mod, verb, ref) {

  pid <- as.character(ref)

  if (identical(verb, "select")) {
    mod$select <- ref
    return(mod)
  }

  if (identical(verb, "rm")) {

    if (identical(as.character(mod$select), pid)) {
      mod$select <- NULL
    }

    if (pid %in% names(mod$add)) {
      mod$add[[pid]] <- NULL
      if (!length(mod$add)) mod$add <- NULL
      return(mod)
    }

    if (pid %in% names(mod$move)) {
      mod$move[[pid]] <- NULL
      if (!length(mod$move)) mod$move <- NULL
    }

    if (pid %in% names(mod$resize)) {
      mod$resize[[pid]] <- NULL
      if (!length(mod$resize)) mod$resize <- NULL
    }
  }

  mod[[verb]][[pid]] <- ref
  mod
}

stage_view_rm <- function(pending, board, name) {

  cur <- isolate(pending())

  if (name %in% cur$views$rm) {
    stage_abort("remove_view", name, "view is already staged for removal")
  }

  new <- cur

  if (name %in% names(cur$views$add)) {

    new$views$add <- new$views$add[
      setdiff(names(new$views$add), name)
    ]

  } else {

    if (name %in% names(cur$views$mod)) {
      new$views$mod <- new$views$mod[
        setdiff(names(new$views$mod), name)
      ]
    }

    new$views$rm <- c(new$views$rm, name)
  }

  if (identical(new$views$active, name)) {
    new$views$active <- NULL
  }

  commit_pending(pending, isolate(board$board), new, "remove_view", name)
}

stage_view_active <- function(pending, board, name) {

  cur <- isolate(pending())

  if (name %in% cur$views$rm) {
    stage_abort(
      "set_active_view", name,
      "view is staged for removal; cannot mark it active"
    )
  }

  new <- cur
  new$views$active <- name

  commit_pending(
    pending, isolate(board$board), new, "set_active_view", name
  )
}

stage_view_rename <- function(pending, board, id, name) {

  cur <- isolate(pending())

  if (id %in% cur$views$rm) {
    stage_abort(
      "rename_view", id,
      "view is staged for removal; cannot rename it"
    )
  }

  new <- cur
  new$views$rename[[id]] <- name

  commit_pending(pending, isolate(board$board), new, "rename_view", id)
}

stage_extension_mod <- function(pending, board, id, delta) {

  cur <- isolate(pending())

  new <- cur

  if (id %in% names(cur$extensions$mod)) {

    new$extensions$mod[[id]] <- merge_args(cur$extensions$mod[[id]], delta)

  } else {

    new$extensions$mod <- c(
      new$extensions$mod, set_names(list(delta), id)
    )
  }

  commit_pending(
    pending, isolate(board$board), new, "modify_extension", id
  )
}

flush_pending <- function(pending, update) {

  payload <- isolate(pending())

  if (!has_any_changes(payload)) {
    reset_pending(pending)
    return(invisible(FALSE))
  }

  tryCatch(
    update(payload),
    error = function(e) {
      warning(
        "flush_pending: dispatch rejected payload: ",
        conditionMessage(e),
        call. = FALSE
      )
    },
    finally = reset_pending(pending)
  )

  invisible(TRUE)
}
