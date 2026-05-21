test_that("default describe_stack.stack returns a name + blocks summary", {

  stk <- new_stack(c("data", "head"), name = "my stack")

  res <- describe_stack(stk)

  expect_type(res, "character")
  expect_match(paste(res, collapse = "\n"), "my stack", fixed = TRUE)
  expect_match(paste(res, collapse = "\n"), "data", fixed = TRUE)
  expect_match(paste(res, collapse = "\n"), "head", fixed = TRUE)
})

test_that("default describe_stack handles an empty stack", {

  stk <- new_stack(character())

  res <- describe_stack(stk)

  expect_type(res, "character")
  expect_match(paste(res, collapse = "\n"), "<empty>", fixed = TRUE)
})

test_that("a class-specific describe_stack override is reached", {

  stk <- new_stack(c("a"))
  class(stk) <- c("fake_stack_for_test", class(stk))

  registerS3method(
    "describe_stack", "fake_stack_for_test",
    function(x, ...) c("custom line 1", "custom line 2"),
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("describe_stack.fake_stack_for_test", envir = globalenv())
    )
  )

  expect_identical(
    describe_stack(stk),
    c("custom line 1", "custom line 2")
  )
})
