test_that("new_assistant_extension produces a valid dock_extension", {

  ext <- new_assistant_extension()

  expect_true(blockr.dock::is_dock_extension(ext))
  expect_s3_class(ext, "assistant_extension")
  expect_identical(blockr.dock::extension_name(ext), "Assistant")
})

test_that("new_assistant_extension validates", {

  expect_silent(
    blockr.dock::validate_extension(new_assistant_extension())
  )
})

test_that("default_system_prompt returns a non-empty string", {

  res <- default_system_prompt()

  expect_type(res, "character")
  expect_length(res, 1L)
  expect_gt(nchar(res), 0L)
})

test_that("format_token_telemetry handles missing / NA / real tokens", {

  expect_identical(format_token_telemetry(NULL), "")

  na_turn <- ellmer::Turn("assistant", "hi")
  expect_identical(format_token_telemetry(na_turn), "")

  real_turn <- ellmer::Turn("assistant", "hi")
  real_turn@tokens <- c(312, 84, NA)

  expect_identical(
    format_token_telemetry(real_turn),
    "input: 312   output: 84   total this turn: 396"
  )
})
