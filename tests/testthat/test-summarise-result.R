test_that("default summarise_result handles data frames via btw_this", {

  res <- summarise_result(head(iris, 5L))

  expect_type(res, "character")
  expect_gt(length(res), 0L)
})

test_that("default summarise_result handles non-tabular objects", {

  res <- summarise_result(list(a = 1, b = 2))

  expect_type(res, "character")
  expect_gt(length(res), 0L)
})

test_that("summarise_result caps a long result and flags the truncation", {

  big <- paste(rep("x", 50000L), collapse = "")

  res <- summarise_result(big, max_chars = 200L)

  expect_lt(nchar(res), 400L)
  expect_match(res, "truncated", fixed = TRUE)
})

test_that("summarise_result never errors on an awkward result", {

  res <- summarise_result(c("a", "b", "c"))

  expect_type(res, "character")
  expect_length(res, 1L)
})

test_that("summarise_result surfaces a failing description", {

  registerS3method(
    "describe_result", "assistant_boom_result",
    function(x, ...) stop("kaboom")
  )

  res <- summarise_result(structure(1L, class = "assistant_boom_result"))

  expect_match(res, "error occurred", fixed = TRUE)
  expect_match(res, "kaboom", fixed = TRUE)
})

test_that("describe_result dispatches on the result class", {

  registerS3method(
    "describe_result", "assistant_fake_result",
    function(x, ...) "custom result summary"
  )

  res <- describe_result(structure(1L, class = "assistant_fake_result"))

  expect_identical(res, "custom result summary")
})

test_that("truncate_chars appends a hint only when one is given", {

  long <- strrep("z", 200L)

  expect_match(truncate_chars(long, 80L, hint = "do X"), "do X", fixed = TRUE)
  expect_no_match(truncate_chars(long, 80L), "do X", fixed = TRUE)
  expect_match(truncate_chars(long, 80L), "truncated", fixed = TRUE)
  expect_identical(truncate_chars("short", 80L), "short")
})

test_that("truncate_chars counts the marker and hint against max_chars", {

  long <- strrep("z", 5000L)

  expect_lte(nchar(truncate_chars(long, 200L)), 200L)
  expect_lte(
    nchar(truncate_chars(long, 200L, hint = "use query_data to fetch rows")),
    200L
  )
})

test_that("the char cap is option-driven, defaulting to 2000", {

  expect_identical(summary_max_chars(), 2000L)

  withr::local_options(blockr.assistant_summary_max_chars = 200L)
  expect_lte(nchar(summarise_result(strrep("z", 5000L))), 200L)
})

test_that("summarise_result caps a method that does not bound itself", {

  registerS3method(
    "describe_result", "assistant_big_result",
    function(x, ...) paste(rep("y", 50000L), collapse = "")
  )

  res <- summarise_result(
    structure(1L, class = "assistant_big_result"), max_chars = 200L
  )

  expect_lt(nchar(res), 400L)
  expect_match(res, "truncated", fixed = TRUE)
})
