png_1x1 <- paste0(
  "data:image/png;base64,",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8",
  "AAAAASUVORK5CYII="
)

look_module <- function(id, board, pending) {
  moduleServer(id, function(input, output, session) {
    look <- new_look_at(board, pending, session)
    list(look = look)
  })
}

settled <- function(promise) {
  out <- NULL
  promises::then(promise, function(value) out <<- list(value = value))
  function() {
    later::run_now(0)
    out
  }
}

test_that("look_at is off unless the deployment turns it on", {

  withr::local_options(blockr.assistant_look_at = NULL)
  expect_false(look_at_enabled())
  expect_null(look_at_dep())

  withr::local_options(blockr.assistant_look_at = TRUE)
  expect_true(look_at_enabled())
  expect_s3_class(look_at_dep(), "html_dependency")
})

test_that("the bridge settles each request once, by id", {

  bridge <- new_look_bridge()
  got <- list()

  first <- bridge$arm(function(x) got$first <<- x, list(target = "a"))
  second <- bridge$arm(function(x) got$second <<- x, list(target = "b"))

  expect_identical(bridge$context(second)$target, "b")

  expect_true(bridge$settle(second, "two"))
  expect_true(bridge$settle(first, "one"))
  expect_identical(got, list(second = "two", first = "one"))

  expect_false(bridge$settle(first, "again"))
  expect_false(bridge$settle(99L, "unknown"))
  expect_null(bridge$context(first))
})

test_that("a PNG reply becomes a note plus an image", {

  dir <- withr::local_tempdir()

  res <- look_at_result(list(png = png_1x1), "view", dir)

  expect_length(res, 2L)
  expect_s7_class(res[[1L]], ellmer::ContentText)
  expect_s7_class(res[[2L]], ellmer::ContentImageInline)
  expect_length(list.files(dir, "\\.png$"), 1L)

  staged <- look_at_result(list(png = png_1x1), "view", dir, staged = TRUE)
  expect_match(staged[[1L]]@text, "Staged changes are not in it")
})

test_that("an off-screen panel points at focus_panel", {

  dir <- withr::local_tempdir()

  res <- look_at_result(list(error = "not on screen"), "a", dir)
  expect_match(res, "focus_panel")

  res <- look_at_result(list(error = "SecurityError"), "a", dir)
  expect_match(res, "SecurityError")

  expect_match(look_at_result(list(png = "nope"), "a", dir), "not a PNG")
})

test_that("the tool waits for the browser and returns its picture", {

  testServer(
    look_module,
    {
      peek <- settled(session$getReturned()$look("view"))
      expect_null(peek())

      session$setInputs(look_at_result = list(id = 99L, png = png_1x1))
      expect_null(peek())

      session$setInputs(look_at_result = list(id = 1L, png = png_1x1))
      res <- peek()$value

      expect_length(res, 2L)
      expect_s7_class(res[[2L]], ellmer::ContentImageInline)
    },
    args = list(board = NULL, pending = reactiveVal(empty_pending()))
  )
})

test_that("the tool gives up when the browser does not answer", {

  withr::local_options(blockr.assistant_look_at_timeout_secs = 0.05)

  testServer(
    look_module,
    {
      peek <- settled(session$getReturned()$look("view"))
      Sys.sleep(0.1)
      expect_match(peek()$value, "No picture arrived")
    },
    args = list(board = NULL, pending = reactiveVal(empty_pending()))
  )
})

test_that("an unknown target is refused before the browser is asked", {

  testServer(
    look_module,
    {
      tool <- tool_look_at(session$getReturned()$look)
      expect_match(tool("nope"), "look_at failed: nope is neither")
    },
    args = list(
      board = reactiveValues(board = blockr.dock::new_dock_board()),
      pending = reactiveVal(empty_pending())
    )
  )
})
