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
