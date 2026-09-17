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

test_that("a plot result names its class", {

  res <- summarise_result(record_plots("plot(1:10)"))

  expect_match(res, "Recorded plot", fixed = TRUE)
  expect_match(res, "recordedplot", fixed = TRUE)
  expect_no_match(res, "C_plot_new", fixed = TRUE)
})

test_that("each recording in an evaluation is described", {

  res <- summarise_result(record_plots("plot(1:10); plot(1:5)"))

  expect_length(gregexpr("Recorded plot", res, fixed = TRUE)[[1L]], 2L)
})

test_that("a plot block that drew nothing is distinguishable", {

  res <- summarise_result(record_plots("1 + 1"))

  expect_match(res, "without drawing", fixed = TRUE)
  expect_no_match(res, "Recorded plot", fixed = TRUE)
})

test_that("a condition keeps its message, not just its kind", {

  res <- summarise_result(
    evaluate::evaluate("plot(1:10); warning('careful')")
  )

  expect_match(res, "Recorded plot", fixed = TRUE)
  expect_match(res, "Warning: careful", fixed = TRUE)
})

test_that("an evaluation's parts are each described, in order", {

  res <- summarise_result(
    evaluate::evaluate("cat('note\n'); plot(1:10); message('m')")
  )

  expect_match(res, "Output: note", fixed = TRUE)
  expect_match(res, "Recorded plot", fixed = TRUE)
  expect_match(res, "Message: m", fixed = TRUE)
})

test_that("an evaluation carrying no recording is still described in full", {

  res <- summarise_result(evaluate::evaluate("cat('partial\n'); stop('bad')"))

  expect_match(res, "Output: partial", fixed = TRUE)
  expect_match(res, "Error: bad", fixed = TRUE)
  expect_no_match(res, "without drawing", fixed = TRUE)
})

test_that("a condition's kind is read off its meaning, not its position", {

  # an rlang-style condition carries several classes ahead of the one that
  # says what it is, so class(x)[[2L]] would name the wrong thing
  cnd <- structure(
    class = c("vctrs_error_cast", "vctrs_error", "rlang_error", "error",
              "condition"),
    list(message = "cannot cast", call = NULL)
  )

  expect_identical(describe_result(cnd), "Error: cannot cast")
})

test_that("a recording is described without claiming a graphics engine", {

  code <- "grid::grid.newpage(); grid::grid.rect()"

  res <- summarise_result(record_plots(code))

  expect_match(res, "Recorded plot", fixed = TRUE)
  expect_no_match(res, "[Bb]ase")
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

test_that("a result summary carries no tool hint when truncated", {

  res <- summarise_result(strrep("z", 5000L), max_chars = 200L)

  expect_match(res, "truncated", fixed = TRUE)
  expect_no_match(res, "inspect_results", fixed = TRUE)
  expect_no_match(res, " -- use ", fixed = TRUE)
})

test_that("a block can say what the model reads in place of its result", {

  registerS3method(
    "llm_block_result", "assistant_fake_display_block",
    function(x, result, server, ...) {
      structure(paste("drawn from", nrow(result), "rows"),
                class = "assistant_fake_drawn")
    }
  )
  registerS3method(
    "describe_result", "assistant_fake_drawn",
    function(x, ...) unclass(x)
  )

  board <- list(
    eval = list(tbl = function() "ready", plain = function() "ready"),
    blocks = list(
      tbl = list(
        block = structure(list(), class = c("assistant_fake_display_block",
                                            "block")),
        server = list(result = function() data.frame(x = 1:3))
      ),
      plain = list(
        block = structure(list(), class = "block"),
        server = list(result = function() "plain result")
      )
    )
  )

  expect_identical(block_result_summary("tbl", board), "drawn from 3 rows")
  expect_match(block_result_summary("plain", board), "plain result")
})
