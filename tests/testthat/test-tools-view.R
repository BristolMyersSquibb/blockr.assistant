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

  lv <- tool_list_views(env$board, view_data = NULL, session = NULL)
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

test_that("list_views reads the live layout from view_data, not the board", {

  committed <- make_view_tool_board()

  live_brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris"), b = new_head_block()),
    views = list(
      v_main = dock_view(c("a", "b"), name = "Analysis"),
      v_over = dock_view(c("a", "b"), name = "Overview")
    )
  )
  live_views <- board_views(live_brd)
  active_view(live_views) <- "v_over"
  vd <- reactiveVal(list(views = live_views, grids = board_grids(live_brd)))

  env <- new_view_tool_env(committed)
  lv  <- tool_list_views(env$board, view_data = vd, session = NULL)
  out <- lv()

  ids    <- vapply(out, function(x) x$id, character(1L))
  active <- vapply(out, function(x) x$active, logical(1L))

  expect_identical(active[ids == "v_over"], TRUE)
  expect_identical(active[ids == "v_main"], FALSE)

  over_layout <- out[[which(ids == "v_over")]]$layout
  expect_setequal(unlist(over_layout$children), c("a", "b"))
})

test_that("list_views falls back to committed board when view_data is NULL", {

  env <- new_view_tool_env()
  vd  <- reactiveVal(NULL)

  lv  <- tool_list_views(env$board, view_data = vd, session = NULL)
  out <- lv()

  ids    <- vapply(out, function(x) x$id, character(1L))
  active <- vapply(out, function(x) x$active, logical(1L))

  expect_setequal(ids, c("v_main", "v_over"))
  expect_identical(active[ids == "v_main"], TRUE)
  expect_identical(active[ids == "v_over"], FALSE)
})

test_that("list_views reports the panels a view's rail holds", {

  brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris"), b = new_head_block()),
    views = list(v_main = dock_view(c("a", "b"), name = "Analysis")),
    grids = list(v_main = dock_grid("a", rail("b", position = "left")))
  )

  lv <- tool_list_views(
    new_view_tool_env(brd)$board, view_data = NULL, session = NULL
  )

  layout <- lv()[[1L]]$layout

  expect_identical(layout$children, list("a"))
  expect_named(layout$rails, "left")
  expect_identical(unlist(layout$rails$left$panels), "b")
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

test_that("validate_layout normalizes and id-checks a railed panel", {

  env <- new_view_tool_env()
  vl <- tool_validate_layout(env$board, env$pending, session = NULL)

  ok <- vl(
    layout = '{"children": ["a"], "rails": {"left": {"panels": ["b"]}}}'
  )

  expect_match(ok, "^OK")
  expect_match(ok, '"rails":\\{"left":\\{"panels":\\["b"\\]')

  bad <- vl(
    layout = '{"children": ["a"], "rails": {"left": {"panels": ["ghost"]}}}'
  )

  expect_match(bad, "^validate_layout failed:")
  expect_match(bad, "ghost")
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

test_that("add_view stages a layout's rail onto the new view's grid", {

  env <- new_view_tool_env()
  av <- tool_add_view(env$board, env$pending, session = NULL)

  res <- av(
    name   = "Railed",
    layout = '{"children": ["a"], "rails": {"left": {"panels": ["b"]}}}'
  )

  expect_match(res, "Staged add_view(Railed)", fixed = TRUE)

  grid <- isolate(env$pending())$views$add[["Railed"]]

  expect_true(is_dock_grid(grid))
  expect_identical(grid[["rails"]][["left"]][["panels"]], "block_panel-b")
  expect_identical(layout_panel_ids(grid), c("block_panel-a", "block_panel-b"))
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

test_that("resize_panel stages a resize verb with a size hint", {

  env <- new_view_tool_env()
  rz <- tool_resize_panel(env$board, env$pending, session = NULL)

  res <- rz(view = "v_main", panel = "b", size = 0.4)

  expect_match(res, "Staged resize_panel(v_main, b) to 0.4", fixed = TRUE)

  ref <- isolate(env$pending()$views$mod[["v_main"]]$resize[["block_panel-b"]])
  expect_true(is_panel_ref(ref))
  expect_identical(as.character(ref), "block_panel-b")
  expect_identical(ref$size, 0.4)
})

test_that("resize_panel rejects an out-of-range size before staging", {

  env <- new_view_tool_env()
  rz <- tool_resize_panel(env$board, env$pending, session = NULL)

  res <- rz(view = "v_main", panel = "b", size = 1.5)

  expect_match(res, "^resize_panel failed:")
  expect_match(res, "size must be a ratio in \\(0, 1\\)")
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("resize_panel rejects a resize on a non-member panel", {

  env <- new_view_tool_env()
  rz <- tool_resize_panel(env$board, env$pending, session = NULL)

  res <- rz(view = "v_over", panel = "b", size = 0.4)

  expect_match(res, "resize_panel\\(v_over\\) failed:")
  expect_match(res, "not view members")
})

test_that("add_panel_to_view records a size hint on the add", {

  env <- new_view_tool_env()
  apv <- tool_add_panel_to_view(env$board, env$pending, session = NULL)

  res <- apv(view = "v_over", panel = "b", size = 0.3)

  expect_match(res, "Staged add_panel_to_view(v_over, b) --", fixed = TRUE)

  ref <- isolate(env$pending()$views$mod[["v_over"]]$add[["block_panel-b"]])
  expect_identical(ref$size, 0.3)
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

test_that("layout_to_llm_spec returns dock's top-level shape", {

  spec <- layout_to_llm_spec(dock_grid("a", "b"))

  expect_named(spec, c("orientation", "children"))
  expect_identical(spec$orientation, "horizontal")
  expect_length(spec$children, 2L)
  expect_identical(spec$children[[1L]], "a")
  expect_identical(spec$children[[2L]], "b")
})

test_that("layout_to_llm_spec strips canonical panel-id prefixes", {

  spec <- layout_to_llm_spec(
    dock_grid("block_panel-foo", "ext_panel-bar")
  )

  expect_identical(spec$children[[1L]], "foo")
  expect_identical(spec$children[[2L]], "bar")
})

test_that("layout_to_llm_spec emits a tabbed leaf as a panels object", {

  spec <- layout_to_llm_spec(
    dock_grid(panels("a", "b", active = "b"))
  )

  child <- spec$children[[1L]]

  expect_false(is.null(child$panels))
  expect_identical(unlist(child$panels), c("a", "b"))
  expect_identical(child$active, "b")
})

test_that("layout_to_llm_spec emits a nested branch via children, not group", {

  spec <- layout_to_llm_spec(
    dock_grid("a", group("b", "c", sizes = c(0.4, 0.6)))
  )

  branch <- spec$children[[2L]]

  expect_false(is.null(branch$children))
  expect_null(branch$group)
  expect_equal(branch$sizes, c(0.4, 0.6))
})

test_that("layout_to_llm_spec emits empty children for an empty layout", {

  spec <- layout_to_llm_spec(dock_grid())

  expect_length(spec$children, 0L)
  expect_identical(spec$orientation, "horizontal")
})

test_that("layout_to_llm_spec emits a rail keyed by the edge it pins to", {

  spec <- layout_to_llm_spec(
    dock_grid("a", "b", rail("ext_panel-assistant", position = "left"))
  )

  expect_identical(spec$children, list("a", "b"))
  expect_named(spec$rails, "left")
  expect_identical(unlist(spec$rails$left$panels), "assistant")
  expect_false(spec$rails$left$collapsed)
})

test_that("layout_to_llm_spec names a rail's open tab only when it has tabs", {

  one <- layout_to_llm_spec(dock_grid("a", rail("b", position = "right")))

  expect_identical(unlist(one$rails$right$panels), "b")
  expect_null(one$rails$right$active)

  many <- layout_to_llm_spec(
    dock_grid("a", rail("b", "c", position = "right", active = "c"))
  )

  expect_identical(unlist(many$rails$right$panels), c("b", "c"))
  expect_identical(many$rails$right$active, "c")
})

test_that("layout_to_llm_spec carries a rail's collapsed state", {

  spec <- layout_to_llm_spec(
    dock_grid("a", rail("b", position = "left", collapsed = TRUE))
  )

  expect_true(spec$rails$left$collapsed)
})

test_that("layout_to_llm_spec omits a rail that holds no panels", {

  spec <- layout_to_llm_spec(
    dock_grid("a", rail(position = "left", collapsed = TRUE))
  )

  expect_null(spec$rails)
})

test_that("layout_from_json pins a rail's resolved panels to its edge", {

  grid <- layout_from_json(
    '{"orientation": "horizontal",
      "children": ["a"],
      "rails": {"right": {"panels": ["b", "d"], "active": "d",
                          "collapsed": true}}}',
    block_ids = c("a", "b"),
    ext_ids = "d"
  )

  railed <- grid[["rails"]][["right"]]

  expect_identical(railed[["position"]], "right")
  expect_identical(railed[["panels"]], c("block_panel-b", "ext_panel-d"))
  expect_identical(railed[["active"]], "ext_panel-d")
  expect_true(railed[["collapsed"]])
})

test_that("a railed panel leaves the grid tree but stays a placed panel", {

  grid <- layout_from_json(
    '{"children": ["a", "b"], "rails": {"left": {"panels": ["b"]}}}',
    block_ids = c("a", "b")
  )

  expect_identical(
    layout_panel_ids(grid), c("block_panel-a", "block_panel-b")
  )
  expect_identical(layout_to_llm_spec(grid)$children, list("a"))
})

test_that("layout_from_json rejects a rail on an edge no dock offers", {

  expect_error(
    layout_from_json(
      '{"children": ["a"], "rails": {"top": {"panels": ["b"]}}}'
    ),
    "rail edge must be one of"
  )
})

test_that("layout_from_json rejects rails that are not keyed by edge", {

  expect_error(
    layout_from_json('{"children": ["a"], "rails": ["b"]}'),
    "must be an object keyed by edge"
  )

  expect_error(
    layout_from_json('{"children": ["a"], "rails": {"left": "b"}}'),
    "rail left must be an object"
  )
})

test_that("layout_from_json resolves bare ids to canonical panel ids", {

  grid <- layout_from_json(
    '{"orientation": "horizontal",
      "children": [{"panels": ["a", "d"], "active": "d"}, "b"]}',
    block_ids = c("a", "b"),
    ext_ids = "d"
  )

  expect_true(is_dock_grid(grid))
  expect_identical(
    layout_panel_ids(grid),
    c("block_panel-a", "ext_panel-d", "block_panel-b")
  )
})

test_that("the LLM spec round-trips through layout_from_json", {

  layouts <- list(
    simple   = dock_grid("a", "b"),
    sized    = dock_grid("a", "b", sizes = c(0.3, 0.7)),
    vertical = dock_grid("a", "b", orientation = "vertical"),
    tabbed   = dock_grid(panels("a", "b", "c")),
    tab_pick = dock_grid(panels("a", "b", active = "b")),
    nested   = dock_grid("a", group("b", "c", sizes = c(0.4, 0.6))),
    railed   = dock_grid("a", rail("b", position = "left")),
    rail_tab = dock_grid(
      "a",
      rail("b", "c", position = "right", active = "c", collapsed = TRUE)
    )
  )

  for (nm in names(layouts)) {

    spec1 <- layout_to_llm_spec(layouts[[nm]])

    json  <- jsonlite::toJSON(spec1, auto_unbox = TRUE)
    spec2 <- layout_to_llm_spec(layout_from_json(json))

    expect_identical(spec1, spec2, info = nm)
  }
})
