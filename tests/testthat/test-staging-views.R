make_view_board <- function() {
  new_dock_board(
    blocks = c(
      a = new_dataset_block("iris"),
      b = new_head_block(external_ctrl = TRUE),
      c = new_head_block()
    ),
    links = c(l = new_link("a", "b", "data")),
    views = list(
      Analysis = c("a", "b"),
      Overview = "a"
    )
  )
}

new_views_env <- function(brd = make_view_board()) {
  list(
    pending = reactiveVal(empty_pending()),
    board   = reactiveValues(board = brd)
  )
}

test_that("stage_view_add stages an add keyed by display name", {

  env <- new_views_env()

  stage_view_add(env$pending, env$board, "Reports", dock_grid(blk("a")))

  p <- isolate(env$pending())

  expect_named(p$views$add, "Reports")
  expect_true(is_dock_grid(p$views$add[["Reports"]]))
  expect_null(p$views$active)
})

test_that("stage_view_add active=TRUE flags the new view active by its key", {

  env <- new_views_env()

  stage_view_add(
    env$pending, env$board, "Reports", dock_grid(blk("a")),
    active = TRUE
  )

  expect_identical(isolate(env$pending()$views$active), "Reports")
})

test_that("stage_view_add rejects a duplicate pending add", {

  env <- new_views_env()
  stage_view_add(env$pending, env$board, "New", dock_grid(blk("a")))

  expect_error(
    stage_view_add(env$pending, env$board, "New", dock_grid(blk("a"))),
    "add_view(New) failed: view is already staged for creation",
    fixed = TRUE
  )
})

test_that("stage_view_add allows a display name already used by a view", {

  env <- new_views_env()

  stage_view_add(env$pending, env$board, "Analysis", dock_grid(blk("a")))

  expect_named(isolate(env$pending()$views$add), "Analysis")
})

test_that("stage_view_add rejects against pending mod and pending rm", {

  env <- new_views_env()
  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add", blk("b")
  )

  expect_error(
    stage_view_add(env$pending, env$board, "Overview", dock_grid(blk("a"))),
    "already staged for panel changes",
    fixed = TRUE
  )

  env <- new_views_env()
  stage_view_rm(env$pending, env$board, "Overview")

  expect_error(
    stage_view_add(env$pending, env$board, "Overview", dock_grid(blk("a"))),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_view_panel_op stages an add verb keyed by panel id", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Analysis", "add", blk("c")
  )

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_named(mod, "add")
  expect_identical(as.character(mod$add[["block_panel-c"]]), "block_panel-c")
})

test_that("stage_view_panel_op stages an rm verb keyed by panel id", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "remove_panel_from_view", "Analysis", "rm", blk("b")
  )

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_named(mod, "rm")
  expect_identical(as.character(mod$rm[["block_panel-b"]]), "block_panel-b")
})

test_that("stage_view_panel_op composes several ops on one view", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add",
    blk("b", near = "a", side = "right")
  )
  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add", blk("c")
  )
  stage_view_panel_op(
    env$pending, env$board, "move_panel", "Overview", "move",
    blk("a", near = "b", side = "left")
  )

  mod <- isolate(env$pending())$views$mod[["Overview"]]

  expect_setequal(names(mod), c("add", "move"))
  expect_setequal(names(mod$add), c("block_panel-b", "block_panel-c"))
  expect_identical(mod$add[["block_panel-b"]]$side, "right")
  expect_identical(as.character(mod$move[["block_panel-a"]]), "block_panel-a")
})

test_that("re-adding the same panel updates its hint in place", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add",
    blk("b", near = "a", side = "right")
  )
  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add",
    blk("b", near = "a", side = "below")
  )

  add <- isolate(env$pending())$views$mod[["Overview"]]$add

  expect_length(add, 1L)
  expect_identical(add[["block_panel-b"]]$side, "below")
})

test_that("removing a panel added the same turn cancels the add", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add", blk("b")
  )
  stage_view_panel_op(
    env$pending, env$board, "remove_panel_from_view", "Overview", "rm", blk("b")
  )

  p <- isolate(env$pending())

  expect_false("Overview" %in% names(p$views$mod))
  expect_false(has_any_changes(p))
})

test_that("removing a panel drops a pending move of it", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "move_panel", "Analysis", "move",
    blk("b", near = "a", side = "right")
  )
  stage_view_panel_op(
    env$pending, env$board, "remove_panel_from_view", "Analysis", "rm", blk("b")
  )

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_named(mod, "rm")
  expect_null(mod$move)
})

test_that("stage_view_panel_op stages a select verb as a single-valued slot", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "focus_panel", "Analysis", "select", blk("b")
  )

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_named(mod, "select")
  expect_identical(as.character(mod$select), "block_panel-b")
})

test_that("a second select on a view replaces the first (one focus per view)", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "focus_panel", "Analysis", "select", blk("a")
  )
  stage_view_panel_op(
    env$pending, env$board, "focus_panel", "Analysis", "select", blk("b")
  )

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_identical(as.character(mod$select), "block_panel-b")
})

test_that("removing a panel clears a pending select of it", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "focus_panel", "Analysis", "select", blk("b")
  )
  stage_view_panel_op(
    env$pending, env$board, "remove_panel_from_view", "Analysis", "rm", blk("b")
  )

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_null(mod$select)
  expect_identical(as.character(mod$rm[["block_panel-b"]]), "block_panel-b")
})

test_that("select composes alongside an add on one view", {

  env <- new_views_env()

  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add", blk("b")
  )
  stage_view_panel_op(
    env$pending, env$board, "focus_panel", "Overview", "select", blk("b")
  )

  mod <- isolate(env$pending())$views$mod[["Overview"]]

  expect_setequal(names(mod), c("add", "select"))
  expect_identical(as.character(mod$select), "block_panel-b")
})

test_that("stage_view_panel_op rejects a staged-add or staged-rm view", {

  env <- new_views_env()
  stage_view_add(env$pending, env$board, "New", dock_grid(blk("a")))

  expect_error(
    stage_view_panel_op(
      env$pending, env$board, "add_panel_to_view", "New", "add", blk("b")
    ),
    "staged for creation",
    fixed = TRUE
  )

  env <- new_views_env()
  stage_view_rm(env$pending, env$board, "Overview")

  expect_error(
    stage_view_panel_op(
      env$pending, env$board, "add_panel_to_view", "Overview", "add", blk("b")
    ),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_view_rm collapses onto a pending add (drops the add)", {

  env <- new_views_env()
  stage_view_add(env$pending, env$board, "New", dock_grid(blk("a")))

  stage_view_rm(env$pending, env$board, "New")

  p <- isolate(env$pending())
  expect_length(p$views$add, 0L)
  expect_length(p$views$rm, 0L)
})

test_that("stage_view_rm discards a pending mod when staging rm", {

  env <- new_views_env()
  stage_view_panel_op(
    env$pending, env$board, "add_panel_to_view", "Overview", "add", blk("b")
  )

  stage_view_rm(env$pending, env$board, "Overview")

  p <- isolate(env$pending())
  expect_length(p$views$mod, 0L)
  expect_equal(p$views$rm, "Overview")
})

test_that("stage_view_rm rejects an already-pending rm", {

  env <- new_views_env()
  stage_view_rm(env$pending, env$board, "Overview")

  expect_error(
    stage_view_rm(env$pending, env$board, "Overview"),
    "already staged for removal",
    fixed = TRUE
  )
})

test_that("stage_view_rm clears active when removing the active-staged view", {

  env <- new_views_env()
  stage_view_add(
    env$pending, env$board, "Reports", dock_grid(blk("a")), active = TRUE
  )

  stage_view_rm(env$pending, env$board, "Reports")

  p <- isolate(env$pending())
  expect_null(p$views$active)
})

test_that("stage_view_active stages and rejects when target is pending rm", {

  env <- new_views_env()
  stage_view_active(env$pending, env$board, "Overview")

  expect_identical(isolate(env$pending()$views$active), "Overview")

  env <- new_views_env()
  stage_view_rm(env$pending, env$board, "Overview")

  expect_error(
    stage_view_active(env$pending, env$board, "Overview"),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_view_rename stages a rename keyed by id", {

  env <- new_views_env()

  stage_view_rename(env$pending, env$board, "Analysis", "Deep Dive")

  p <- isolate(env$pending())
  expect_identical(p$views$rename[["Analysis"]], "Deep Dive")
  expect_length(p$views$add, 0L)
  expect_length(p$views$rm, 0L)
})

test_that("stage_view_rename rejects a view staged for removal", {

  env <- new_views_env()
  stage_view_rm(env$pending, env$board, "Overview")

  expect_error(
    stage_view_rename(env$pending, env$board, "Overview", "X"),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("commit_pending surfaces dock_board views validation errors", {

  env <- new_views_env()

  expect_error(
    stage_view_panel_op(
      env$pending, env$board, "add_panel_to_view", "DoesNotExist", "add",
      blk("a")
    ),
    "add_panel_to_view(DoesNotExist) failed:",
    fixed = TRUE
  )
})
