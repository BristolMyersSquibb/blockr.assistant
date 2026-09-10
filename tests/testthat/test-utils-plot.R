test_that("a page is blank until something is drawn on it", {

  dir <- withr::local_tempdir()

  grDevices::png(file.path(dir, "p%03d.png"), width = 400, height = 400)
  dev <- grDevices::dev.cur()
  on.exit(if (dev %in% grDevices::dev.list()) grDevices::dev.off(dev))
  grDevices::dev.control(displaylist = "enable")

  expect_true(is_blank_page())

  plot(1:10)

  expect_false(is_blank_page())
})

test_that("capture_drawings returns no page when nothing is drawn", {

  # Linux discards the page the device is sitting on at close; Windows and
  # macOS write it. Without the display-list check every text-only call came
  # back with a blank image attached on those two.
  drawn <- capture_drawings(function() invisible(NULL), 400L, 400L)
  on.exit(unlink(drawn$dir, recursive = TRUE))

  expect_length(drawn$files, 0L)
})

test_that("capture_drawings keeps the page that was drawn on", {

  drawn <- capture_drawings(function() plot(1:10), 400L, 400L)
  on.exit(unlink(drawn$dir, recursive = TRUE))

  expect_length(drawn$files, 1L)
})

test_that("capture_drawings keeps one page per plot drawn", {

  drawn <- capture_drawings(function() {
    plot(1:10)
    plot(1:5)
  }, 400L, 400L)
  on.exit(unlink(drawn$dir, recursive = TRUE))

  expect_length(drawn$files, 2L)
})

test_that("capture_drawings closes its device even when the code errors", {

  before <- grDevices::dev.list()

  expect_error(capture_drawings(function() stop("boom"), 400L, 400L), "boom")
  expect_identical(grDevices::dev.list(), before)
})
