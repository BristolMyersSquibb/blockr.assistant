# Whether the installed blockr.dock resolves a views-delta `active` that
# forward-references a view added in the same delta (by its add key) to
# the freshly-minted id -- the contract add-and-activate relies on,
# shipped in blockr.dock #175 (PR for #174). The add-activate tests assert
# the behaviour unconditionally; the dedicated canary test that calls this
# names the exact dependency, so a build against a blockr.dock predating
# #175 fails loudly rather than silently skipping the feature. See
# blockr.assistant #30.
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
