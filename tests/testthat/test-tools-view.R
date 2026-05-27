make_view_tool_board <- function() {
  new_dock_board(
    blocks = c(
      a = new_dataset_block("iris"),
      b = new_head_block(external_ctrl = TRUE)
    ),
    links = c(l = new_link("a", "b", "data")),
    layouts = list(
      Analysis = dock_layout("a", "b", active = TRUE),
      Overview = dock_layout("a")
    )
  )
}

new_view_tool_env <- function(brd = make_view_tool_board()) {
  list(
    pending = reactiveVal(empty_pending()),
    board   = reactiveValues(board = brd)
  )
}

test_that("list_views returns one entry per view with name, active, layout", {

  env <- new_view_tool_env()

  lv <- tool_list_views(env$board, view_data = NULL, session = NULL)
  out <- lv()

  expect_length(out, 2L)

  nms <- vapply(out, function(x) x$name, character(1L))
  active <- vapply(out, function(x) x$active, logical(1L))

  expect_setequal(nms, c("Analysis", "Overview"))
  expect_identical(active[nms == "Analysis"], TRUE)
  expect_identical(active[nms == "Overview"], FALSE)

  analysis_layout <- out[[which(nms == "Analysis")]]$layout
  expect_named(analysis_layout, c("children", "orientation", "active_group"))
})

test_that("list_views prefers live view_data when supplied", {

  env <- new_view_tool_env()

  live <- as_dock_layouts(dock_layout("a", "b", active = TRUE))
  names(live) <- "Hot"
  vd <- reactive(live)

  lv <- tool_list_views(env$board, view_data = vd, session = NULL)
  out <- isolate(lv())

  expect_length(out, 1L)
  expect_identical(out[[1L]]$name, "Hot")
})

test_that("validate_layout returns OK and the normalized layout", {

  env <- new_view_tool_env()
  vl <- tool_validate_layout(env$board, env$pending, session = NULL)

  res <- vl(
    layout = "{\"children\": [\"a\", \"b\"], \"orientation\": \"horizontal\"}"
  )

  expect_match(res, "^OK -- layout parses")
  expect_match(res, "\"children\":\\[\"a\",\"b\"\\]")
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("validate_layout surfaces structural errors without staging", {

  env <- new_view_tool_env()
  vl <- tool_validate_layout(env$board, env$pending, session = NULL)

  res <- vl(layout = paste0(
    "{\"children\": [",
    "  {\"children\": [\"a\"], \"orientation\": \"vertical\"}",
    "], \"orientation\": \"horizontal\"}"
  ))

  expect_match(res, "^validate_layout failed:")
  expect_match(res, "`children` is only valid at the top level")
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("validate_layout rejects unknown panel IDs", {

  env <- new_view_tool_env()
  vl <- tool_validate_layout(env$board, env$pending, session = NULL)

  res <- vl(layout = "{\"children\": [\"a\", \"ghost\"]}")

  expect_match(res, "^validate_layout failed:")
  expect_match(res, "ghost")
})

test_that("validate_layout accepts staged-add panel IDs", {

  env <- new_view_tool_env()

  ab <- tool_add_block(env$board, env$pending, NULL)
  ab(type = "head_block", args = "{\"n\": 5}", id = "new_head")

  vl <- tool_validate_layout(env$board, env$pending, session = NULL)
  res <- vl(layout = "{\"children\": [\"a\", \"new_head\"]}")

  expect_match(res, "^OK")
})

test_that("add_view stages a parsed layout and optional active", {

  env <- new_view_tool_env()
  av <- tool_add_view(env$board, env$pending, session = NULL)

  res <- av(
    name   = "Reports",
    layout = "{\"children\": [\"b\"], \"orientation\": \"horizontal\"}",
    active = TRUE
  )

  expect_match(res, "Staged add_view(Reports) as active", fixed = TRUE)

  p <- isolate(env$pending())
  expect_named(p$views$add, "Reports")
  expect_true(is_dock_layout(p$views$add[["Reports"]]))
  expect_identical(p$views$active, "Reports")
})

test_that("add_view surfaces layout JSON parse errors as tool failures", {

  env <- new_view_tool_env()
  av <- tool_add_view(env$board, env$pending, session = NULL)

  res <- av(name = "X", layout = "{not json")

  expect_match(res, "^add_view failed:")
  expect_length(isolate(env$pending()$views$add), 0L)
})

test_that("add_view rejects malformed layout objects with a classed error", {

  env <- new_view_tool_env()
  av <- tool_add_view(env$board, env$pending, session = NULL)

  res <- av(
    name   = "X",
    layout = "{\"orientation\": \"horizontal\"}"
  )

  expect_match(res, "^add_view failed:")
  expect_match(res, "requires `children`")
})

test_that("remove_view stages an rm and rejects the last remaining view", {

  env <- new_view_tool_env()
  rv <- tool_remove_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )

  res <- rv(name = "Overview")
  expect_match(res, "Staged remove_view(Overview)", fixed = TRUE)

  solo_brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    layouts = list(P = dock_layout("a"))
  )
  solo_env <- new_view_tool_env(solo_brd)
  rv_solo <- tool_remove_view(
    solo_env$board, solo_env$pending, view_data = NULL, session = NULL
  )

  res <- rv_solo(name = "P")
  expect_match(res, "cannot remove the last remaining view")
  expect_length(isolate(solo_env$pending()$views$rm), 0L)
})

test_that("modify_view parses and stages the replacement layout", {

  env <- new_view_tool_env()
  mv <- tool_modify_view(env$board, env$pending, session = NULL)

  res <- mv(
    name   = "Analysis",
    layout = "{\"children\": [\"a\"], \"orientation\": \"vertical\"}"
  )

  expect_match(res, "Staged modify_view(Analysis)", fixed = TRUE)

  staged <- isolate(env$pending()$views$mod[["Analysis"]])
  expect_true(is_dock_layout(staged))
})

test_that("modify_view rejects an unknown view via the dock validator", {

  env <- new_view_tool_env()
  mv <- tool_modify_view(env$board, env$pending, session = NULL)

  res <- mv(
    name   = "DoesNotExist",
    layout = "{\"children\": [\"a\"]}"
  )

  expect_match(res, "modify_view\\(DoesNotExist\\) failed:")
})

test_that("set_active_view stages the active marker", {

  env <- new_view_tool_env()
  sav <- tool_set_active_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )

  res <- sav(name = "Overview")
  expect_match(res, "Staged set_active_view(Overview)", fixed = TRUE)
  expect_identical(isolate(env$pending()$views$active), "Overview")
})

test_that("set_active_view accepts a view staged for creation this turn", {

  env <- new_view_tool_env()

  av <- tool_add_view(env$board, env$pending, session = NULL)
  av(
    name   = "Reports",
    layout = "{\"children\": [\"a\"], \"orientation\": \"horizontal\"}"
  )

  sav <- tool_set_active_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )
  res <- sav(name = "Reports")

  expect_match(res, "^Staged set_active_view")
  expect_identical(isolate(env$pending()$views$active), "Reports")
})

test_that("set_active_view rejects an unknown view", {

  env <- new_view_tool_env()
  sav <- tool_set_active_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )

  res <- sav(name = "Ghost")
  expect_match(res, "^set_active_view failed:")
  expect_match(res, "does not exist")
})

test_that("rename_view synthesises add + rm + active carry-over", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )

  res <- rnv(from = "Analysis", to = "Deep Dive")

  expect_match(res, "Staged rename_view(Analysis -> Deep Dive)", fixed = TRUE)

  p <- isolate(env$pending())
  expect_named(p$views$add, "Deep Dive")
  expect_equal(p$views$rm, "Analysis")
  expect_identical(p$views$active, "Deep Dive")
  expect_true(is_dock_layout(p$views$add[["Deep Dive"]]))
})

test_that("rename_view rejects when target already exists", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )

  res <- rnv(from = "Analysis", to = "Overview")

  expect_match(res, "^rename_view failed:")
  expect_match(res, "already exists")
})

test_that("rename_view rejects an unknown source", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )

  res <- rnv(from = "Ghost", to = "Other")

  expect_match(res, "^rename_view failed:")
  expect_match(res, "does not exist")
})

test_that("rename round-trips through layout_to_spec (regression)", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(
    env$board, env$pending, view_data = NULL, session = NULL
  )

  before <- isolate(layout_to_spec(board_layouts(env$board$board)$Analysis))

  rnv(from = "Analysis", to = "Alpha")

  staged_layout <- isolate(env$pending()$views$add[["Alpha"]])
  after <- layout_to_spec(staged_layout)

  expect_identical(before, after)
})

test_that("add_block + modify_view compose atomically through validation", {

  env <- new_view_tool_env()

  ab <- tool_add_block(env$board, env$pending, NULL)
  ab(type = "head_block", args = "{\"n\": 3}", id = "new_head")

  mv <- tool_modify_view(env$board, env$pending, session = NULL)
  layout_json <- paste0(
    "{\"children\": [\"a\", \"new_head\"], ",
    "\"orientation\": \"horizontal\"}"
  )
  res <- mv(name = "Analysis", layout = layout_json)

  expect_match(res, "^Staged modify_view")

  p <- isolate(env$pending())
  expect_named(p$blocks$add, "new_head")
  expect_named(p$views$mod, "Analysis")

  expect_silent(
    isolate(validate_board_update(p, env$board$board))
  )
})
