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

  any(
    lengths(payload$blocks) > 0L,
    lengths(payload$links)  > 0L,
    lengths(payload$stacks) > 0L
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
