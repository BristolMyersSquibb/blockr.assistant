test_that("a tool error carries what the failure means for the turn", {

  res <- with_tool_errors("inspect_results", stop("undefined columns selected"))

  # The condition message describes R. On its own the model reads it as a slip
  # in its own code and draws no conclusion about the turn, so the consequence
  # travels with it.
  expect_match(res, "^inspect_results failed: undefined columns selected")
  expect_true(endsWith(res, tool_failure_note()))
})

test_that("a message already naming its call keeps that form, with the note", {

  res <- with_tool_errors("modify_block", stop("modify_block(x) failed: boom"))

  expect_match(res, "^modify_block\\(x\\) failed: boom")
  expect_false(grepl("modify_block failed: modify_block", res))
  expect_true(endsWith(res, tool_failure_note()))
})

test_that("the note is appended once, not once per wrapper", {

  res <- with_tool_errors(
    "outer", stop(with_tool_errors("inner", stop("boom")))
  )

  n <- lengths(regmatches(res, gregexpr("This call did not run", res)))
  expect_equal(n, 1L)
})

test_that("a call that succeeds is returned untouched", {
  expect_equal(with_tool_errors("list_blocks", "two blocks"), "two blocks")
})
