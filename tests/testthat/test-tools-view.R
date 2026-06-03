make_view_tool_board <- function() {
  new_dock_board(
    blocks = c(
      a = new_dataset_block("iris"),
      b = new_head_block(external_ctrl = TRUE)
    ),
    links = c(l = new_link("a", "b", "data")),
    layouts = list(
      v_main = dock_layout("a", "b", name = "Analysis"),
      v_over = dock_layout("a", name = "Overview")
    )
  )
}

new_view_tool_env <- function(brd = make_view_tool_board()) {
  list(
    pending = reactiveVal(empty_pending()),
    board   = reactiveValues(board = brd)
  )
}

test_that("list_views returns id, name, active and layout per view", {

  env <- new_view_tool_env()

  lv <- tool_list_views(env$board, session = NULL)
  out <- lv()

  expect_length(out, 2L)

  ids    <- vapply(out, function(x) x$id, character(1L))
  names_ <- vapply(out, function(x) x$name, character(1L))
  active <- vapply(out, function(x) x$active, logical(1L))

  expect_setequal(ids, c("v_main", "v_over"))
  expect_identical(names_[ids == "v_main"], "Analysis")
  expect_identical(names_[ids == "v_over"], "Overview")
  expect_identical(active[ids == "v_main"], TRUE)
  expect_identical(active[ids == "v_over"], FALSE)

  main_layout <- out[[which(ids == "v_main")]]$layout
  expect_named(main_layout, c("orientation", "children"))
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
    "  {\"unexpected\": \"a\"}",
    "], \"orientation\": \"horizontal\"}"
  ))

  expect_match(res, "^validate_layout failed:")
  expect_match(res, "must be a string or an object")
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

test_that("add_view stages a parsed layout under its display name", {

  env <- new_view_tool_env()
  av <- tool_add_view(env$board, env$pending, session = NULL)

  res <- av(
    name   = "Reports",
    layout = "{\"children\": [\"b\"], \"orientation\": \"horizontal\"}"
  )

  expect_match(res, "Staged add_view(Reports)", fixed = TRUE)

  p <- isolate(env$pending())
  expect_named(p$views$add, "Reports")
  expect_true(is_dock_layout(p$views$add[["Reports"]]))
  expect_null(p$views$active)
})

test_that("add_view active=TRUE flags the new view active by its add key", {

  env <- new_view_tool_env()
  av <- tool_add_view(env$board, env$pending, session = NULL)

  res <- av(
    name   = "Reports",
    layout = "{\"children\": [\"b\"], \"orientation\": \"horizontal\"}",
    active = TRUE
  )

  expect_match(res, "Staged add_view(Reports) as active", fixed = TRUE)
  expect_identical(isolate(env$pending()$views$active), "Reports")
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
    layout = "{\"children\": [{\"unexpected\": \"a\"}]}"
  )

  expect_match(res, "^add_view failed:")
  expect_match(res, "must be a string or an object")
})

test_that("remove_view stages an rm by id and rejects the last view", {

  env <- new_view_tool_env()
  rv <- tool_remove_view(env$board, env$pending, session = NULL)

  res <- rv(id = "v_over")
  expect_match(res, "Staged remove_view(v_over)", fixed = TRUE)
  expect_equal(isolate(env$pending()$views$rm), "v_over")

  solo_brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    layouts = list(only = dock_layout("a", name = "Page"))
  )
  solo_env <- new_view_tool_env(solo_brd)
  rv_solo <- tool_remove_view(solo_env$board, solo_env$pending, session = NULL)

  res <- rv_solo(id = "only")
  expect_match(res, "cannot remove the last remaining view")
  expect_length(isolate(solo_env$pending()$views$rm), 0L)
})

test_that("modify_view parses and stages the replacement layout by id", {

  env <- new_view_tool_env()
  mv <- tool_modify_view(env$board, env$pending, session = NULL)

  res <- mv(
    id     = "v_main",
    layout = "{\"children\": [\"a\"], \"orientation\": \"vertical\"}"
  )

  expect_match(res, "Staged modify_view(v_main)", fixed = TRUE)

  staged <- isolate(env$pending()$views$mod[["v_main"]])
  expect_true(is_dock_layout(staged))
})

test_that("modify_view rejects an unknown view id via the dock validator", {

  env <- new_view_tool_env()
  mv <- tool_modify_view(env$board, env$pending, session = NULL)

  res <- mv(
    id     = "does_not_exist",
    layout = "{\"children\": [\"a\"]}"
  )

  expect_match(res, "modify_view\\(does_not_exist\\) failed:")
})

test_that("set_active_view stages the active marker by id", {

  env <- new_view_tool_env()
  sav <- tool_set_active_view(env$board, env$pending, session = NULL)

  res <- sav(id = "v_over")
  expect_match(res, "Staged set_active_view(v_over)", fixed = TRUE)
  expect_identical(isolate(env$pending()$views$active), "v_over")
})

test_that("set_active_view accepts a view staged for creation this turn", {

  env <- new_view_tool_env()

  av <- tool_add_view(env$board, env$pending, session = NULL)
  av(
    name   = "Reports",
    layout = "{\"children\": [\"a\"], \"orientation\": \"horizontal\"}"
  )

  sav <- tool_set_active_view(env$board, env$pending, session = NULL)
  res <- sav(id = "Reports")

  expect_match(res, "^Staged set_active_view")
  expect_identical(isolate(env$pending()$views$active), "Reports")
})

test_that("set_active_view rejects an unknown view", {

  env <- new_view_tool_env()
  sav <- tool_set_active_view(env$board, env$pending, session = NULL)

  res <- sav(id = "ghost")
  expect_match(res, "^set_active_view failed:")
  expect_match(res, "does not exist")
})

test_that("rename_view stages a name change keyed by id, layout untouched", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(env$board, env$pending, session = NULL)

  res <- rnv(id = "v_main", name = "Deep Dive")

  expect_match(res, "Staged rename_view(v_main -> Deep Dive)", fixed = TRUE)

  p <- isolate(env$pending())
  expect_identical(p$views$rename[["v_main"]], "Deep Dive")
  expect_length(p$views$add, 0L)
  expect_length(p$views$rm, 0L)
  expect_null(p$views$active)
})

test_that("rename_view allows a label already in use (ids stay distinct)", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(env$board, env$pending, session = NULL)

  res <- rnv(id = "v_over", name = "Analysis")

  expect_match(res, "Staged rename_view(v_over -> Analysis)", fixed = TRUE)
  expect_identical(isolate(env$pending()$views$rename[["v_over"]]), "Analysis")
})

test_that("rename_view rejects an unknown view id", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(env$board, env$pending, session = NULL)

  res <- rnv(id = "ghost", name = "Other")

  expect_match(res, "^rename_view failed:")
  expect_match(res, "does not exist")
})

test_that("rename_view leaves the board layout in place (regression)", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(env$board, env$pending, session = NULL)

  before <- isolate(as.list(board_layouts(env$board$board)[["v_main"]]))

  rnv(id = "v_main", name = "Alpha")

  after <- isolate(as.list(board_layouts(env$board$board)[["v_main"]]))

  expect_identical(before, after)
  expect_length(isolate(env$pending()$views$add), 0L)
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
  res <- mv(id = "v_main", layout = layout_json)

  expect_match(res, "^Staged modify_view")
})
