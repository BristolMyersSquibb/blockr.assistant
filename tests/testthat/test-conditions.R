test_that("format_conditions reports a healthy block plainly", {

  res <- format_conditions(cnd_frame(), "b1")

  expect_match(res, "Block b1 has no active conditions", fixed = TRUE)
})

test_that("format_conditions groups by severity, pluralises, and notes phase", {

  df <- cnd_frame(
    cnd_row("b1", "error", "boom"),
    cnd_row("b1", "warning", "coerced", phase = "data"),
    cnd_row("b1", "warning", "again", phase = "data")
  )

  res <- format_conditions(df, "b1")

  expect_match(res, "Block b1 conditions:", fixed = TRUE)
  expect_match(res, "Error (1):", fixed = TRUE)
  expect_match(res, "- [eval] boom", fixed = TRUE)
  expect_match(res, "Warnings (2):", fixed = TRUE)
  expect_match(res, "- [data] coerced", fixed = TRUE)
  expect_match(res, "- [data] again", fixed = TRUE)
})

test_that("format_condition_marker is empty for a healthy block", {

  expect_identical(format_condition_marker(cnd_frame()), "")
})

test_that("format_condition_marker counts, pluralises, and orders severities", {

  df <- cnd_frame(
    cnd_row("b", "error", "e"),
    cnd_row("b", "warning", "w1", phase = "data"),
    cnd_row("b", "warning", "w2", phase = "data")
  )

  res <- format_condition_marker(df)

  expect_match(res, "^\\[.*\\]$")
  expect_match(res, "1 error, .*2 warnings")
  expect_match(res, intToUtf8(0x2716), fixed = TRUE)
  expect_match(res, intToUtf8(0x26a0), fixed = TRUE)
})

test_that("block_condition_marker is empty when the block has no conditions", {

  expect_identical(
    block_condition_marker("a", cnd_frame(cnd_row("b", "error", "boom"))),
    ""
  )
})

test_that("block_condition_marker marks a block from the board frame", {

  res <- block_condition_marker("a", cnd_frame(cnd_row("a", "error", "boom")))

  expect_match(res, "1 error", fixed = TRUE)
})

test_that("block_condition_markers maps live blocks to markers", {

  board <- reactiveValues(
    blocks = list(d = list(), e = list()),
    conditions = reactiveVal(cnd_frame(cnd_row("d", "error", "boom")))
  )

  res <- isolate(block_condition_markers(board))

  expect_named(res, c("d", "e"))
  expect_match(res[["d"]], "1 error", fixed = TRUE)
  expect_identical(res[["e"]], "")
})

test_that("block_condition_markers is empty without live blocks", {

  board <- reactiveValues(
    blocks = list(),
    conditions = reactiveVal(cnd_frame())
  )

  expect_length(isolate(block_condition_markers(board)), 0L)
})
