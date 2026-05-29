test_that("layout_to_llm_spec returns dock's top-level shape", {

  spec <- layout_to_llm_spec(dock_layout("a", "b"))

  expect_named(spec, c("orientation", "children"))
  expect_identical(spec$orientation, "horizontal")
  expect_length(spec$children, 2L)
  expect_identical(spec$children[[1L]], "a")
  expect_identical(spec$children[[2L]], "b")
})

test_that("layout_to_llm_spec strips canonical panel-id prefixes", {

  spec <- layout_to_llm_spec(
    dock_layout("block_panel-foo", "ext_panel-bar")
  )

  expect_identical(spec$children[[1L]], "foo")
  expect_identical(spec$children[[2L]], "bar")
})

test_that("layout_to_llm_spec emits a tabbed leaf as a panels object", {

  spec <- layout_to_llm_spec(
    dock_layout(panels("a", "b", active = "b"))
  )

  child <- spec$children[[1L]]

  expect_false(is.null(child$panels))
  expect_identical(unlist(child$panels), c("a", "b"))
  expect_identical(child$active, "b")
})

test_that("layout_to_llm_spec emits a nested branch via children, not group", {

  spec <- layout_to_llm_spec(
    dock_layout("a", group("b", "c", sizes = c(0.4, 0.6)))
  )

  branch <- spec$children[[2L]]

  expect_false(is.null(branch$children))
  expect_null(branch$group)
  expect_equal(branch$sizes, c(0.4, 0.6))
})

test_that("layout_to_llm_spec emits empty children for an empty layout", {

  spec <- layout_to_llm_spec(dock_layout())

  expect_length(spec$children, 0L)
  expect_identical(spec$orientation, "horizontal")
})

test_that("the LLM spec round-trips through dock's layout_from_json", {

  layouts <- list(
    simple   = dock_layout("a", "b"),
    sized    = dock_layout("a", "b", sizes = c(0.3, 0.7)),
    vertical = dock_layout("a", "b", orientation = "vertical"),
    tabbed   = dock_layout(panels("a", "b", "c")),
    tab_pick = dock_layout(panels("a", "b", active = "b")),
    nested   = dock_layout("a", group("b", "c", sizes = c(0.4, 0.6)))
  )

  for (nm in names(layouts)) {

    spec1 <- layout_to_llm_spec(layouts[[nm]])

    json  <- jsonlite::toJSON(spec1, auto_unbox = TRUE)
    spec2 <- layout_to_llm_spec(layout_from_json(json))

    expect_identical(spec1, spec2, info = nm)
  }
})
