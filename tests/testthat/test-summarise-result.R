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

test_that("a class-specific method is honoured over the default", {

  obj <- structure(list(), class = "fake_result_for_test")

  registerS3method(
    "summarise_result", "fake_result_for_test",
    function(x, ...) "fake override line",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("summarise_result.fake_result_for_test", envir = globalenv())
    )
  )

  expect_identical(summarise_result(obj), "fake override line")
})
