make_view_tool_board <- function() {
  new_dock_board(
    blocks = c(
      a = new_dataset_block("iris"),
      b = new_head_block(external_ctrl = TRUE)
    ),
    links = c(l = new_link("a", "b", "data")),
    views = list(
      v_main = dock_view(c("a", "b"), name = "Analysis"),
      v_over = dock_view("a", name = "Overview")
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
  expect_true(is_dock_grid(p$views$add[["Reports"]]))
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
    views = list(only = dock_view("a", name = "Page"))
  )
  solo_env <- new_view_tool_env(solo_brd)
  rv_solo <- tool_remove_view(solo_env$board, solo_env$pending, session = NULL)

  res <- rv_solo(id = "only")
  expect_match(res, "cannot remove the last remaining view")
  expect_length(isolate(solo_env$pending()$views$rm), 0L)
})

test_that("add_panel_to_view stages an add verb with a placement hint", {

  env <- new_view_tool_env()
  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)

  res <- apv(view = "v_over", panel = "b", near = "a", side = "right")

  expect_match(
    res, "Staged add_panel_to_view(v_over, b) (right of a)", fixed = TRUE
  )

  ref <- isolate(env$pending()$views$mod[["v_over"]]$add[["block_panel-b"]])
  expect_true(is_panel_ref(ref))
  expect_identical(as.character(ref), "block_panel-b")
  expect_identical(ref$near, "a")
  expect_identical(ref$side, "right")
})

test_that("add_panel_to_view without a hint stages a bare add", {

  env <- new_view_tool_env()
  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)

  res <- apv(view = "v_over", panel = "b")

  expect_match(res, "Staged add_panel_to_view(v_over, b) --", fixed = TRUE)

  ref <- isolate(env$pending()$views$mod[["v_over"]]$add[["block_panel-b"]])
  expect_null(ref$near)
  expect_null(ref$side)
})

test_that("add_panel_to_view rejects an unknown panel before staging", {

  env <- new_view_tool_env()
  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)

  res <- apv(view = "v_over", panel = "ghost")

  expect_match(res, "^add_panel_to_view failed:")
  expect_match(res, "does not resolve to a current block or extension")
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("add_panel_to_view rejects a bad side keyword", {

  env <- new_view_tool_env()
  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)

  res <- apv(view = "v_over", panel = "b", near = "a", side = "diagonal")

  expect_match(res, "^add_panel_to_view failed:")
  expect_match(res, "side must be one of")
})

test_that("add_panel_to_view rejects an add on a non-existent view", {

  env <- new_view_tool_env()
  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)

  res <- apv(view = "does_not_exist", panel = "b")

  expect_match(res, "add_panel_to_view\\(does_not_exist\\) failed:")
})

test_that("remove_panel_from_view stages an rm verb by id", {

  env <- new_view_tool_env()
  rpv <- tool_remove_panel_from_view(env$board, env$pending, session = NULL)

  res <- rpv(view = "v_main", panel = "b")

  expect_match(res, "Staged remove_panel_from_view(v_main, b)", fixed = TRUE)

  ref <- isolate(env$pending()$views$mod[["v_main"]]$rm[["block_panel-b"]])
  expect_identical(as.character(ref), "block_panel-b")
})

test_that("add then remove of the same panel cancels out", {

  env <- new_view_tool_env()
  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)
  rpv <- tool_remove_panel_from_view(env$board, env$pending, session = NULL)

  apv(view = "v_over", panel = "b")
  rpv(view = "v_over", panel = "b")

  expect_false("v_over" %in% names(isolate(env$pending()$views$mod)))
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("move_panel stages a move verb with a placement hint", {

  env <- new_view_tool_env()
  mp <- tool_move_panel(env$board, env$pending, session = NULL)

  res <- mp(view = "v_main", panel = "b", near = "a", side = "below")

  expect_match(res, "Staged move_panel(v_main, b) (below of a)", fixed = TRUE)

  ref <- isolate(env$pending()$views$mod[["v_main"]]$move[["block_panel-b"]])
  expect_identical(as.character(ref), "block_panel-b")
  expect_identical(ref$near, "a")
  expect_identical(ref$side, "below")
})

test_that("move_panel rejects a move onto a non-member anchor", {

  env <- new_view_tool_env()
  mp <- tool_move_panel(env$board, env$pending, session = NULL)

  res <- mp(view = "v_over", panel = "a", near = "b", side = "right")

  expect_match(res, "move_panel\\(v_over\\) failed:")
  expect_match(res, "not a view member")
})

test_that("focus_panel stages a select on the active view without switching", {

  env <- new_view_tool_env()
  fp <- tool_focus_panel(env$board, env$pending, session = NULL)

  res <- fp(view = "v_main", panel = "b")

  expect_match(res, "Staged focus_panel(v_main, b) --", fixed = TRUE)

  p <- isolate(env$pending())
  sel <- p$views$mod[["v_main"]]$select
  expect_identical(as.character(sel), "block_panel-b")
  expect_null(p$views$active)
})

test_that("focus_panel on a non-active view also switches to it", {

  env <- new_view_tool_env()
  fp <- tool_focus_panel(env$board, env$pending, session = NULL)

  res <- fp(view = "v_over", panel = "a")

  expect_match(
    res, "Staged focus_panel(v_over, a) and switched to that view",
    fixed = TRUE
  )

  p <- isolate(env$pending())
  sel <- p$views$mod[["v_over"]]$select
  expect_identical(as.character(sel), "block_panel-a")
  expect_identical(p$views$active, "v_over")
})

test_that("focus_panel rejects a panel that isn't a member of the view", {

  env <- new_view_tool_env()
  fp <- tool_focus_panel(env$board, env$pending, session = NULL)

  res <- fp(view = "v_over", panel = "b")

  expect_match(res, "focus_panel\\(v_over\\) failed:")
  expect_match(res, "not a view member")
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("focus_panel rejects an unknown panel before staging", {

  env <- new_view_tool_env()
  fp <- tool_focus_panel(env$board, env$pending, session = NULL)

  res <- fp(view = "v_main", panel = "ghost")

  expect_match(res, "^focus_panel failed:")
  expect_match(res, "does not resolve to a current block or extension")
  expect_false(has_any_changes(isolate(env$pending())))
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

test_that("rename_view leaves view membership in place (regression)", {

  env <- new_view_tool_env()
  rnv <- tool_rename_view(env$board, env$pending, session = NULL)

  before <- isolate(view_members(board_views(env$board$board)[["v_main"]]))

  rnv(id = "v_main", name = "Alpha")

  after <- isolate(view_members(board_views(env$board$board)[["v_main"]]))

  expect_identical(before, after)
  expect_length(isolate(env$pending()$views$add), 0L)
  expect_length(isolate(env$pending()$views$mod), 0L)
})

test_that("add_block + add_panel_to_view compose through validation", {

  env <- new_view_tool_env()

  ab <- tool_add_block(env$board, env$pending, NULL)
  ab(type = "head_block", args = "{\"n\": 3}", id = "new_head")

  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)
  res <- apv(view = "v_main", panel = "new_head", near = "a", side = "right")

  expect_match(res, "^Staged add_panel_to_view")

  mod <- isolate(env$pending())$views$mod[["v_main"]]
  expect_identical(
    as.character(mod$add[["block_panel-new_head"]]), "block_panel-new_head"
  )
})
