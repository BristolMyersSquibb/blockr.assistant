test_that("layout_to_wire returns the documented top-level shape", {

  wire <- layout_to_wire(dock_layout("a", "b"))

  expect_named(wire, c("children", "orientation", "active_group"))
  expect_length(wire$children, 2L)
  expect_identical(wire$children[[1L]], "a")
  expect_identical(wire$children[[2L]], "b")
  expect_identical(wire$orientation, "horizontal")
})

test_that("layout_to_wire round-trips through layout_from_wire", {

  layouts <- list(
    simple    = dock_layout("a", "b"),
    sized     = dock_layout("a", "b", sizes = c(0.3, 0.7)),
    vertical  = dock_layout("a", "b", orientation = "vertical"),
    tabbed    = dock_layout(panels("a", "b", "c")),
    tab_pick  = dock_layout(panels("a", "b", active = "b")),
    nested    = dock_layout(
      "a",
      group("b", "c", sizes = c(0.4, 0.6))
    )
  )

  for (nm in names(layouts)) {

    wire1 <- layout_to_wire(layouts[[nm]])
    back  <- layout_from_wire(wire1)
    wire2 <- layout_to_wire(back)

    expect_identical(wire1, wire2, info = nm)
  }
})

test_that("layout_to_wire strips panel-id prefixes", {

  ly <- dock_layout("block_panel-foo", "ext_panel-bar")
  wire <- layout_to_wire(ly)

  expect_identical(wire$children[[1L]], "foo")
  expect_identical(wire$children[[2L]], "bar")
})

test_that("layout_to_wire encodes panels with non-first-active as object", {

  wire <- layout_to_wire(
    dock_layout(panels("a", "b", active = "b"))
  )

  child <- wire$children[[1L]]
  expect_named(child, c("panels", "active"))
  expect_identical(child$active, "b")
})

test_that("layout_to_wire encodes groups with uneven sizes as object", {

  wire <- layout_to_wire(
    dock_layout(group("a", "b", sizes = c(0.3, 0.7)))
  )

  child <- wire$children[[1L]]
  expect_named(child, c("group", "sizes"))
  expect_equal(child$sizes, c(0.3, 0.7))
})

test_that("layout_to_wire emits empty children for an empty layout", {

  wire <- layout_to_wire(dock_layout())

  expect_length(wire$children, 0L)
  expect_identical(wire$orientation, "horizontal")
})

test_that("layout_from_wire rejects unknown top-level keys", {

  parsed <- list(
    children    = list("a"),
    orientation = "horizontal",
    bogus       = "x"
  )

  expect_error(
    layout_from_wire(parsed),
    "unknown top-level keys"
  )
})

test_that("layout_from_wire rejects objects without `children`", {

  expect_error(
    layout_from_wire(list(orientation = "horizontal")),
    "requires `children`"
  )
})

test_that("layout_from_wire rejects panels mixed with group/children keys", {

  parsed <- list(
    children = list(
      list(panels = list("a", "b"), group = list("c"))
    )
  )

  expect_error(layout_from_wire(parsed), "panels.*group")
})

test_that("parse_layout_json reports JSON parse failures", {

  expect_error(
    parse_layout_json("{bad"),
    "layout JSON parse failed"
  )
})

test_that("parse_layout_json builds a dock_layout from a string", {

  ly <- parse_layout_json(
    "{\"children\": [\"a\", \"b\"], \"orientation\": \"horizontal\"}"
  )

  expect_true(is_dock_layout(ly))
})
