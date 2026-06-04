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
