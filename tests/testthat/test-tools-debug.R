test_that("the failing statement is named, with its text and the error", {

  # The prod case: the script is valid R, the block's own rewriting of it
  # produced a one-argument `<-`, and the only signal was the bare condition.
  # Deparsed, the broken call reads `x <- NULL`, so the contradiction between
  # the statement shown and the error is the finding.
  broken <- call("<-", quote(x))
  res <- run_statements(list(quote(y <- 1), broken, quote(y + 1)),
                        new.env(parent = baseenv()))

  expect_false(res$ok)
  expect_equal(res$at, 2L)
  expect_match(res$message, "Statement 2 of 3 raised")
  expect_match(res$message, 'incorrect number of arguments to "<-"', fixed = TRUE)
  expect_length(res$lines, 1L)
  expect_match(res$lines[[1L]], "1\\. y <- 1")
})

test_that("a run to the end reports each statement's shape", {

  env <- new.env(parent = baseenv())
  assign("data", data.frame(a = 1:3), envir = env)

  res <- run_statements(list(quote(d <- data), quote(d[d$a > 1, , drop = FALSE])),
                        env)

  expect_true(res$ok)
  expect_length(res$lines, 2L)
  expect_match(res$lines[[2L]], "data frame, 2 x 1")
})

test_that("statements come from a braced expression, or from one on its own", {

  expect_length(lang_statements(quote({ a; b; c })), 3L)
  expect_length(lang_statements(quote(a + b)), 1L)
})

test_that("a value is described in the terms the next statement needs", {
  expect_equal(value_line(data.frame(a = 1:2, b = 3:4)), "data frame, 2 x 2")
  expect_equal(value_line(NULL), "NULL")
  expect_match(value_line(structure(list(), class = "composed_table")), "composed_table")
})
