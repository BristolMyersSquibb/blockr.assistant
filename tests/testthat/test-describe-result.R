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

test_that("a plot result names its class and counts the recordings", {

  res <- summarise_result(record_plots("plot(1:10)"))

  expect_match(res, "recordedplot", fixed = TRUE)
  expect_match(res, "1 recorded plot", fixed = TRUE)
  expect_no_match(res, "C_plot_new", fixed = TRUE)
})

test_that("a plot result pluralises several recordings", {

  res <- summarise_result(record_plots("plot(1:10); plot(1:5)"))

  expect_match(res, "2 recorded plots", fixed = TRUE)
})

test_that("a plot block that drew nothing is distinguishable", {

  res <- summarise_result(record_plots("1 + 1"))

  expect_match(res, "without drawing", fixed = TRUE)
  expect_no_match(res, "recorded plot (", fixed = TRUE)
})

test_that("an evaluation carrying no recording is left to the default", {

  # `evaluate_evaluation` is a general container this package does not own,
  # so a result of another shape must not be described as a plot that is
  # missing -- it gets the description it would have had.
  res <- summarise_result(evaluate::evaluate("cat('hi'); warning('careful')"))

  expect_no_match(res, "Graphics result", fixed = TRUE)
  expect_no_match(res, "without drawing", fixed = TRUE)
  expect_match(res, "evaluation", ignore.case = TRUE)
})

test_that("an evaluation mixing plots with other parts counts them all", {

  res <- summarise_result(
    evaluate::evaluate("cat('note'); plot(1:10); warning('hm')")
  )

  expect_match(res, "1 recorded plot", fixed = TRUE)
  expect_match(res, "1 warning", fixed = TRUE)
  expect_match(res, "1 output", fixed = TRUE)
})

test_that("a subclassed result takes precedence over the shipped methods", {

  registerS3method(
    "describe_result", "assistant_custom_eval",
    function(x, ...) "custom evaluation summary"
  )

  res <- describe_result(
    structure(
      record_plots("plot(1:10)"),
      class = c("assistant_custom_eval", "evaluate_evaluation", "list")
    )
  )

  expect_identical(res, "custom evaluation summary")
})


test_that("a bare recordedplot is described like a one-plot evaluation", {

  res <- describe_result(record_plots("plot(1:10)")[[1L]])

  expect_match(res, "1 recorded plot", fixed = TRUE)
})

test_that("a result summary carries no tool hint when truncated", {

  res <- summarise_result(strrep("z", 5000L), max_chars = 200L)

  expect_match(res, "truncated", fixed = TRUE)
  expect_no_match(res, "inspect_results", fixed = TRUE)
  expect_no_match(res, " -- use ", fixed = TRUE)
})

test_that("a recording is described without claiming a graphics engine", {

  code <- "grid::grid.newpage(); grid::grid.rect()"

  res <- summarise_result(record_plots(code))

  expect_match(res, "1 recorded plot", fixed = TRUE)
  expect_no_match(res, "[Bb]ase")
})
