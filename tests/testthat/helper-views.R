# Whether the installed blockr.dock resolves a views-delta `active` that
# forward-references a view added in the same delta (by its add key) to
# the freshly-minted id. The assistant addresses existing views by id, so
# "add a view and make it active" can only name the not-yet-minted view by
# its add key -- which the dock must resolve. Pending blockr.dock #174;
# the affected tests skip until it lands. See blockr.assistant #30.
forward_ref_active_supported <- function() {

  brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    layouts = list(v1 = dock_layout("a", name = "One"))
  )

  upd <- list(
    views = list(
      add    = list(Probe = dock_layout("a")),
      active = "Probe"
    )
  )

  isTRUE(
    tryCatch(
      {
        validate_board_update(upd, brd)
        TRUE
      },
      error = function(e) FALSE
    )
  )
}

skip_without_forward_ref <- function() {
  testthat::skip_if_not(
    forward_ref_active_supported(),
    "blockr.dock does not yet resolve add-and-activate (blockr.dock #174)"
  )
}
