test_that("truncate_chars appends a hint only when one is given", {

  long <- strrep("z", 200L)

  expect_match(truncate_chars(long, 80L, hint = "do X"), "do X", fixed = TRUE)
  expect_no_match(truncate_chars(long, 80L), "do X", fixed = TRUE)
  expect_match(truncate_chars(long, 80L), "truncated", fixed = TRUE)
  expect_identical(truncate_chars("short", 80L), "short")
})

test_that("truncate_chars counts the marker and hint against max_chars", {

  long <- strrep("z", 5000L)
  hint <- "use get_block_state for the whole value"

  expect_lte(nchar(truncate_chars(long, 200L)), 200L)
  expect_lte(nchar(truncate_chars(long, 200L, hint = hint)), 200L)
})

test_that("truncate_chars can keep whole lines", {

  txt <- paste(strrep("x", 30L), strrep("y", 30L), strrep("z", 30L), sep = "\n")

  expect_match(truncate_chars(txt, 70L), "\nyyy", fixed = TRUE)
  expect_identical(
    truncate_chars(txt, 70L, whole_lines = TRUE),
    paste0(strrep("x", 30L), "\n... [+62 chars truncated]")
  )

  # Text with no line break inside the budget can only be cut mid-line.
  long <- truncate_chars(strrep("x", 200L), 70L, whole_lines = TRUE)

  expect_lte(nchar(long), 70L)
  expect_match(long, "^x+\n")
})

test_that("the char cap is option-driven, defaulting to 2000", {

  expect_identical(summary_max_chars(), 2000L)

  withr::local_options(blockr.assistant_summary_max_chars = 200L)
  expect_lte(nchar(summarise_result(strrep("z", 5000L))), 200L)
})

test_that("the inspect_results output budget is option-driven", {

  expect_identical(eval_max_chars(), 16000L)

  withr::local_options(blockr.assistant_eval_max_chars = 500L)

  expect_identical(eval_max_chars(), 500L)
})
