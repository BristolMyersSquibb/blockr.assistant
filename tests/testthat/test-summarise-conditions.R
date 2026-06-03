mk_block_cnd <- function(x) {
  structure(x, id = x, class = "block_cnd")
}

test_that("summarise_conditions flattens an empty cond to a 0-row frame", {

  res <- summarise_conditions(list())

  expect_s3_class(res, "data.frame")
  expect_named(res, c("severity", "phase", "message"))
  expect_equal(nrow(res), 0L)
})

test_that("summarise_conditions drops phases with empty severity lists", {

  cond <- list(
    eval = list(error = list(), warning = list(), message = list())
  )

  expect_equal(nrow(summarise_conditions(cond)), 0L)
})

test_that("summarise_conditions groups by severity and notes the phase", {

  cond <- list(
    eval = list(error = list(mk_block_cnd("boom"))),
    data = list(warning = list(mk_block_cnd("coerced")))
  )

  res <- summarise_conditions(cond)

  expect_equal(res$severity, c("error", "warning"))
  expect_equal(res$phase, c("eval", "data"))
  expect_equal(res$message, c("boom", "coerced"))
})

test_that("summarise_conditions orders severities error > warning > message", {

  cond <- list(
    eval = list(
      message = list(mk_block_cnd("m")),
      warning = list(mk_block_cnd("w")),
      error   = list(mk_block_cnd("e"))
    )
  )

  expect_equal(
    summarise_conditions(cond)$severity,
    c("error", "warning", "message")
  )
})

test_that("summarise_conditions orders phases by evaluation order", {

  cond <- list(
    render = list(warning = list(mk_block_cnd("r"))),
    data   = list(warning = list(mk_block_cnd("d"))),
    eval   = list(warning = list(mk_block_cnd("e")))
  )

  expect_equal(summarise_conditions(cond)$phase, c("data", "eval", "render"))
})

test_that("summarise_conditions keeps every message within a phase", {

  cond <- list(
    data = list(warning = list(mk_block_cnd("first"), mk_block_cnd("second")))
  )

  res <- summarise_conditions(cond)

  expect_equal(res$message, c("first", "second"))
  expect_equal(res$phase, c("data", "data"))
})

test_that("summarise_conditions strips block_cnd attributes from messages", {

  res <- summarise_conditions(
    list(eval = list(error = list(mk_block_cnd("boom"))))
  )

  expect_identical(res$message, "boom")
  expect_null(attributes(res$message))
})

test_that("format_conditions reports a healthy block plainly", {

  res <- format_conditions(summarise_conditions(list()), "b1")

  expect_match(res, "Block b1 has no active conditions", fixed = TRUE)
})

test_that("format_conditions groups by severity, pluralises, and notes phase", {

  cond <- list(
    eval = list(error = list(mk_block_cnd("boom"))),
    data = list(warning = list(mk_block_cnd("coerced"), mk_block_cnd("again")))
  )

  res <- format_conditions(summarise_conditions(cond), "b1")

  expect_match(res, "Block b1 conditions:", fixed = TRUE)
  expect_match(res, "Error (1):", fixed = TRUE)
  expect_match(res, "- [eval] boom", fixed = TRUE)
  expect_match(res, "Warnings (2):", fixed = TRUE)
  expect_match(res, "- [data] coerced", fixed = TRUE)
  expect_match(res, "- [data] again", fixed = TRUE)
})

test_that("format_condition_marker is empty for a healthy block", {

  expect_identical(format_condition_marker(summarise_conditions(list())), "")
})

test_that("format_condition_marker counts, pluralises, and orders severities", {

  cond <- list(
    eval = list(error = list(mk_block_cnd("e"))),
    data = list(warning = list(mk_block_cnd("w1"), mk_block_cnd("w2")))
  )

  res <- format_condition_marker(summarise_conditions(cond))

  expect_match(res, "^\\[.*\\]$")
  expect_match(res, "1 error, .*2 warnings")
  expect_match(res, intToUtf8(0x2716), fixed = TRUE)
  expect_match(res, intToUtf8(0x26a0), fixed = TRUE)
})

test_that("block_condition_marker is empty when the block carries no cond", {

  expect_identical(block_condition_marker(list(server = list())), "")
})

test_that("block_condition_markers maps live block servers to markers", {

  cond <- do.call(
    reactiveValues,
    list(eval = list(error = list(mk_block_cnd("boom"))))
  )
  board <- reactiveValues(blocks = list(d = list(server = list(cond = cond))))

  res <- isolate(block_condition_markers(board))

  expect_named(res, "d")
  expect_match(res[["d"]], "1 error", fixed = TRUE)
})

test_that("block_condition_markers is empty without live blocks", {

  res <- isolate(block_condition_markers(reactiveValues(board = 1)))

  expect_length(res, 0L)
})
