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

  sprintf("%s(%s) failed: %s", op, id, msg)
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

  commit_pending(pending, isolate(board$board), new, "remove_block", id)
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
      "view exists and is staged for modification; use modify_view"
    )
  }

  if (name %in% cur$views$rm) {
    stage_abort(
      "add_view", name,
      "view is staged for removal; use modify_view instead"
    )
  }

  new <- cur
  new$views$add <- c(new$views$add, set_names(list(layout), name))

  if (isTRUE(active)) {
    new$views$active <- name
  }

  commit_pending(pending, isolate(board$board), new, "add_view", name)
}

stage_view_mod <- function(pending, board, name, layout) {

  cur <- isolate(pending())

  if (name %in% names(cur$views$add)) {
    stage_abort(
      "modify_view", name,
      paste0(
        "view is staged for creation this turn; pass the updated ",
        "layout to add_view instead"
      )
    )
  }

  if (name %in% cur$views$rm) {
    stage_abort(
      "modify_view", name,
      "view is staged for removal; mod has no effect"
    )
  }

  new <- cur
  new$views$mod[[name]] <- layout

  commit_pending(pending, isolate(board$board), new, "modify_view", name)
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

# Blocks/links/stacks change what the model must VERIFY, so immediate-commit
# applies them mid-turn. View/extension mutations are pure layout: applying
# them mid-turn can relocate the assistant's own panel and kill the running
# stream (dock re-attach), and there is nothing to verify -- they stay staged
# until the turn-end flush.
has_core_changes <- function(payload) {
  any(
    lengths(payload$blocks) > 0L,
    lengths(payload$links)  > 0L,
    lengths(payload$stacks) > 0L
  )
}

# Immediate-commit mid-turn path: flush only the block/link/stack part of the
# pending payload, leaving view and extension staging in place for turn end.
flush_pending_core <- function(pending, update, last_flush_error = NULL) {

  payload <- isolate(pending())

  if (!has_core_changes(payload)) {
    return(invisible(FALSE))
  }

  empty <- empty_pending()

  core <- empty
  core$blocks <- payload$blocks
  core$links  <- payload$links
  core$stacks <- payload$stacks

  rest <- payload
  rest$blocks <- empty$blocks
  rest$links  <- empty$links
  rest$stacks <- empty$stacks

  tryCatch(
    {
      update(core)
      if (!is.null(last_flush_error)) {
        last_flush_error(NULL)
      }
    },
    error = function(e) {

      if (!is.null(last_flush_error)) {
        last_flush_error(conditionMessage(e))
      }

      warning(
        "flush_pending_core: dispatch rejected payload: ",
        conditionMessage(e),
        call. = FALSE
      )
    },
    finally = pending(rest)
  )

  invisible(TRUE)
}

flush_pending <- function(pending, update, last_flush_error = NULL) {

  payload <- isolate(pending())

  if (!has_any_changes(payload)) {

    reset_pending(pending)

    if (!is.null(last_flush_error)) {
      last_flush_error(NULL)
    }

    return(invisible(FALSE))
  }

  tryCatch(
    {
      update(payload)
      if (!is.null(last_flush_error)) {
        last_flush_error(NULL)
      }
    },
    error = function(e) {

      if (!is.null(last_flush_error)) {
        last_flush_error(conditionMessage(e))
      }

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
