status_board <- function(...) {
  reactiveValues(eval = do.call(reactiveValues, list(...)))
}

test_that("eval_status reads a block's live status reactive", {

  board <- status_board(d = reactive("stale"), e = reactive("ready"))

  expect_identical(isolate(eval_status("d", board)), "stale")
  expect_identical(isolate(eval_status("e", board)), "ready")
})

test_that("eval_status is NA for a block the board reports nothing for", {

  expect_identical(
    isolate(eval_status("d", status_board(e = reactive("ready")))),
    NA_character_
  )

  expect_identical(isolate(eval_status("d", list())), NA_character_)
})

test_that("eval_status reads the statuses a live board server publishes", {

  brd <- new_board(
    blocks = c(a = new_dataset_block("iris"), b = new_head_block())
  )

  testServer(
    getS3method("board_server", "board"),
    {
      session$flushReact()

      expect_identical(eval_status("a", rv), "ready")
      expect_identical(eval_status("b", rv), "waiting")
      expect_identical(eval_status("gone", rv), NA_character_)
    },
    args = list(x = brd)
  )
})

test_that("a live block with no result reports its status, not NULL", {

  brd <- new_board(
    blocks = c(a = new_dataset_block("iris"), b = new_head_block())
  )

  testServer(
    getS3method("board_server", "board"),
    {
      session$flushReact()

      expect_match(
        block_result_summary("b", rv),
        "Block b has no result to read (`waiting`)",
        fixed = TRUE
      )
      expect_match(block_result_summary("a", rv), "Sepal.Length", fixed = TRUE)
    },
    args = list(x = brd)
  )
})

test_that("eval_status_note glosses each status holding no result", {

  expect_match(eval_status_note("dormant"), "off screen", fixed = TRUE)
  expect_match(eval_status_note("stale"), "out of date", fixed = TRUE)
  expect_match(eval_status_note("waiting"), "data input", fixed = TRUE)
  expect_match(eval_status_note("unset"), "argument value", fixed = TRUE)
  expect_match(
    eval_status_note("failed"), "get_block_conditions", fixed = TRUE
  )
})

test_that("eval_status_note is NULL for a block that has a result", {

  expect_null(eval_status_note("ready"))
  expect_null(eval_status_note(NA_character_))
})

test_that("eval_status_marker brackets a status with no result", {

  board <- status_board(d = reactive("stale"), e = reactive("ready"))

  expect_identical(isolate(eval_status_marker("d", board)), "[stale]")
  expect_identical(isolate(eval_status_marker("e", board)), "")
  expect_identical(isolate(eval_status_marker("gone", board)), "")
})

test_that("eval_status_line names the status and what it means", {

  expect_match(eval_status_line("stale"), "^Eval status: stale -- ")
  expect_identical(eval_status_line("ready"), "Eval status: ready")
  expect_null(eval_status_line(NA_character_))
})

test_that("block_markers leads the condition marker with the eval status", {

  board <- reactiveValues(
    blocks = list(d = list(), e = list(), f = list()),
    conditions = reactiveVal(cnd_frame(cnd_row("d", "error", "boom"))),
    eval = reactiveValues(
      d = reactive("failed"), e = reactive("dormant"), f = reactive("ready")
    )
  )

  res <- isolate(block_markers(board))

  expect_named(res, c("d", "e", "f"))
  expect_match(res[["d"]], "^\\[failed\\] \\[.*1 error\\]$")
  expect_identical(res[["e"]], "[dormant]")
  expect_identical(res[["f"]], "")
})

test_that("block_markers is empty without live blocks", {

  board <- reactiveValues(
    blocks = list(),
    conditions = reactiveVal(cnd_frame()),
    eval = reactiveValues()
  )

  expect_length(isolate(block_markers(board)), 0L)
})

test_that("no_result_message explains a dormant block", {

  res <- no_result_message("d", "dormant", simpleError(""))

  expect_match(res, "Block d has no result to read (`dormant`)", fixed = TRUE)
  expect_match(res, "off screen", fixed = TRUE)
})

test_that("no_result_message flags a stale block's result as out of date", {

  expect_match(
    no_result_message("d", "stale", simpleError("")),
    "out of date",
    fixed = TRUE
  )
})

test_that("no_result_message falls back to the raised error", {

  expect_match(
    no_result_message("d", NA_character_, simpleError("boom")),
    "Block d has not evaluated successfully: boom",
    fixed = TRUE
  )
})

test_that("no_result_message says so when there is no reason to give", {

  expect_identical(
    no_result_message("d", NA_character_, simpleError("")),
    "Block d has not evaluated and reports no reason."
  )
})

test_that("skipped_block_lines groups skipped blocks by status", {

  res <- skipped_block_lines(
    c(a = "dormant", b = "stale", c = "dormant", d = NA_character_)
  )

  expect_match(res[[1L]], "Skipped blocks", fixed = TRUE)
  expect_true(any(grepl("- a, c (`dormant`):", res, fixed = TRUE)))
  expect_true(any(grepl("- b (`stale`):", res, fixed = TRUE)))
  expect_true(any(grepl("- d: no result available", res, fixed = TRUE)))
})
