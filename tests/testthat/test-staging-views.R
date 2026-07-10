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
  stage_view_mod(
    env$pending, env$board, "Overview", dock_grid(blk("a"), blk("b"))
  )

  expect_error(
    stage_view_add(env$pending, env$board, "Overview", dock_grid(blk("a"))),
    "staged for modification",
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

test_that("stage_view_mod stages the membership delta as panel-op verbs", {

  env <- new_views_env()

  stage_view_mod(
    env$pending, env$board, "Analysis",
    dock_grid(blk("a"), blk("b"), blk("c"))
  )

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_named(mod, "add")
  expect_identical(as.character(mod$add[[1L]]), "block_panel-c")
})

test_that("stage_view_mod removes members the layout drops", {

  env <- new_views_env()

  stage_view_mod(env$pending, env$board, "Analysis", dock_grid(blk("a")))

  mod <- isolate(env$pending())$views$mod[["Analysis"]]

  expect_named(mod, "rm")
  expect_identical(as.character(mod$rm[[1L]]), "block_panel-b")
})

test_that("stage_view_mod rejects against add / rm", {

  env <- new_views_env()
  stage_view_add(env$pending, env$board, "New", dock_grid(blk("a")))

  expect_error(
    stage_view_mod(env$pending, env$board, "New", dock_grid(blk("b"))),
    "staged for creation",
    fixed = TRUE
  )

  env <- new_views_env()
  stage_view_rm(env$pending, env$board, "Overview")

  expect_error(
    stage_view_mod(env$pending, env$board, "Overview", dock_grid(blk("a"))),
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
  stage_view_mod(
    env$pending, env$board, "Overview", dock_grid(blk("a"), blk("b"))
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
    stage_view_mod(
      env$pending, env$board, "DoesNotExist", dock_grid(blk("a"))
    ),
    "modify_view(DoesNotExist) failed:",
    fixed = TRUE
  )
})
