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

test_that("the state bounds are option-driven, with a two-tier default", {

  expect_identical(state_value_max_chars(), 128L)
  expect_identical(state_max_chars(), 20000L)

  # The detail tier is reached deliberately, so it sits far above the summary
  # it exists behind -- a bound that did not would fix nothing.
  expect_gt(state_max_chars(), summary_max_chars())

  withr::local_options(
    blockr.assistant_state_max_chars = 300L,
    blockr.assistant_state_value_max_chars = 20L
  )

  expect_identical(state_max_chars(), 300L)
  expect_identical(state_value_max_chars(), 20L)
})
