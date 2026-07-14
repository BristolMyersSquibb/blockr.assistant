make_board <- function(results = list()) {

  reactiveValues(
    board  = new_board(),
    blocks = lapply(
      results,
      function(r) {
        list(server = list(result = reactive(r)))
      }
    )
  )
}

call_query <- function(code, results = list()) {
  tool <- tool_query_data(make_board(results), NULL, NULL)
  tool(code = code)
}

test_that("query_data evaluates a single expression against a bound block", {

  res <- isolate(call_query("nrow(data)", list(data = iris)))

  expect_match(res@value, "150", fixed = TRUE)
})

test_that("query_data auto-prints the last expression value", {

  res <- isolate(
    call_query("length(unique(data$Species))", list(data = iris))
  )

  expect_match(res@value, "3", fixed = TRUE)
})

test_that("query_data captures stdout from intermediate print calls", {

  res <- isolate(
    call_query("print('hello'); 42", list(data = iris))
  )

  expect_match(res@value, "hello", fixed = TRUE)
  expect_match(res@value, "42", fixed = TRUE)
})

test_that("query_data with no arg returns the failed-envelope on parse error", {

  res <- isolate(call_query("nrow(data", list(data = iris)))

  expect_match(res@value, "^query_data failed:")
})

test_that("query_data returns the failed-envelope on runtime error", {

  res <- isolate(call_query("stop('boom')", list(data = iris)))

  expect_match(res@value, "^query_data failed:")
  expect_match(res@value, "boom", fixed = TRUE)
})

test_that("query_data skips blocks whose result errors", {

  bad_results <- list(
    ok  = 1:3
  )
  brd <- reactiveValues(
    board = new_board(),
    blocks = list(
      ok  = list(server = list(result = reactive(1:3))),
      bad = list(
        server = list(
          result = reactive(stop("eval error"))
        )
      )
    )
  )
  tool <- tool_query_data(brd, NULL, NULL)

  res <- isolate(tool(code = "sum(ok)"))

  expect_match(res@value, "skipped blocks with errors: bad", fixed = TRUE)
  expect_match(res@value, "6", fixed = TRUE)
})

test_that("query_data truncates output over 200 lines", {

  res <- isolate(call_query("seq_len(5000)", list(data = iris)))

  expect_match(res@value, "output truncated", fixed = TRUE)
})
