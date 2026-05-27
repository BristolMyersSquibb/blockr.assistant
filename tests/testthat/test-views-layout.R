test_that("layout_to_spec returns the documented top-level shape", {

  spec <- layout_to_spec(dock_layout("a", "b"))

  expect_named(spec, c("children", "orientation", "active_group"))
  expect_length(spec$children, 2L)
  expect_identical(spec$children[[1L]], "a")
  expect_identical(spec$children[[2L]], "b")
  expect_identical(spec$orientation, "horizontal")
})

test_that("layout_to_spec round-trips through layout_from_spec", {

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

    spec1 <- layout_to_spec(layouts[[nm]])
    back  <- layout_from_spec(spec1)
    spec2 <- layout_to_spec(back)

    expect_identical(spec1, spec2, info = nm)
  }
})

test_that("layout_to_spec strips panel-id prefixes", {

  ly <- dock_layout("block_panel-foo", "ext_panel-bar")
  spec <- layout_to_spec(ly)

  expect_identical(spec$children[[1L]], "foo")
  expect_identical(spec$children[[2L]], "bar")
})

test_that("layout_to_spec encodes panels with non-first-active as object", {

  spec <- layout_to_spec(
    dock_layout(panels("a", "b", active = "b"))
  )

  child <- spec$children[[1L]]
  expect_named(child, c("panels", "active"))
  expect_identical(child$active, "b")
})

test_that("layout_to_spec encodes groups with uneven sizes as object", {

  spec <- layout_to_spec(
    dock_layout(group("a", "b", sizes = c(0.3, 0.7)))
  )

  child <- spec$children[[1L]]
  expect_named(child, c("group", "sizes"))
  expect_equal(child$sizes, c(0.3, 0.7))
})

test_that("layout_to_spec emits empty children for an empty layout", {

  spec <- layout_to_spec(dock_layout())

  expect_length(spec$children, 0L)
  expect_identical(spec$orientation, "horizontal")
})

test_that("layout_from_spec rejects unknown top-level keys", {

  parsed <- list(
    children    = list("a"),
    orientation = "horizontal",
    bogus       = "x"
  )

  expect_error(
    layout_from_spec(parsed),
    "unknown top-level keys"
  )
})

test_that("layout_from_spec rejects objects without `children`", {

  expect_error(
    layout_from_spec(list(orientation = "horizontal")),
    "requires `children`"
  )
})

test_that("layout_from_spec rejects panels mixed with group/children keys", {

  parsed <- list(
    children = list(
      list(panels = list("a", "b"), group = list("c"))
    )
  )

  expect_error(layout_from_spec(parsed), "panels.*group")
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

test_that("parse_layout_json coerces list-form `sizes` to numeric", {

  # simplifyVector = FALSE yields list-of-numbers; group()'s
  # validate_sizes rejects non-numeric. coerce_sizes() bridges.
  ly <- parse_layout_json(paste0(
    "{\"children\": [",
    "  {\"group\": [\"a\", \"b\", \"c\"],",
    "   \"sizes\": [33.33, 33.33, 33.34]},",
    "  \"d\"",
    "], \"orientation\": \"horizontal\", \"sizes\": [70, 30]}"
  ))

  expect_true(is_dock_layout(ly))

  spec <- layout_to_spec(ly)
  expect_equal(spec$sizes, c(70, 30))
})

test_that("parse_layout_json rejects non-numeric `sizes`", {

  expect_error(
    parse_layout_json(
      "{\"children\": [\"a\", \"b\"], \"sizes\": [\"big\", \"small\"]}"
    ),
    "must be an array of numbers"
  )
})

test_that("spec preserves nested splits across round-trip (regression)", {

  # An even-split inner branch used to round-trip to a bare array,
  # which then re-parsed as a tab leaf -- silently collapsing a split
  # into tabs. Now branches always emit `{group: ...}`.
  ly <- parse_layout_json(paste0(
    "{\"children\": [",
    "  {\"group\": [\"a\", {\"group\": [\"b\", \"c\"]}]},",
    "  \"d\"",
    "], \"orientation\": \"horizontal\"}"
  ))

  ly2 <- layout_from_spec(layout_to_spec(ly))

  expect_identical(ly$grid, ly2$grid)
})

test_that("spec rejects unnamed arrays of mixed types with a hint", {

  # All-strings unnamed arrays are unambiguous (tab leaf); a mixed
  # array at a node position used to silently mean "group". Now
  # rejected with a pointer at the `{group: [...]}` form.
  expect_error(
    parse_layout_json(paste0(
      "{\"children\": [",
      "  [\"a\", {\"panels\": [\"b\", \"c\"]}]",
      "], \"orientation\": \"horizontal\"}"
    )),
    "unnamed array can only hold panel IDs"
  )
})

test_that("spec rejects nested `children` with a helpful message", {

  # Most natural model mistake: recursing the top-level shape.
  expect_error(
    parse_layout_json(paste0(
      "{\"children\": [",
      "  {\"children\": [\"a\", \"b\"], \"orientation\": \"vertical\"},",
      "  \"c\"",
      "], \"orientation\": \"horizontal\"}"
    )),
    "`children` is only valid at the top level"
  )
})
