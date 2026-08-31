make_iris_board <- function() {
  new_board(
    blocks = c(
      data = new_dataset_block("iris"),
      head = new_head_block()
    ),
    links = c(new_link("data", "head", "data"))
  )
}

test_that("default describe_block.block surfaces class, args, links", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["head"]]

  res <- describe_block(blk, board = brd, id = "head")

  expect_type(res, "character")
  expect_gt(length(res), 1L)

  text <- paste(res, collapse = "\n")
  expect_match(text, "head", fixed = TRUE)
  expect_match(text, "Incoming links", fixed = TRUE)
  expect_match(text, "data", fixed = TRUE)
})

test_that("describe_block reports 'none' when there are no incoming links", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]

  res <- describe_block(blk, board = brd, id = "data")

  expect_match(
    paste(res, collapse = "\n"),
    "Incoming links: (none)",
    fixed = TRUE
  )
})

test_that("describe_block surfaces external-control declaration", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]

  res <- describe_block(blk, board = brd, id = "data")

  expect_match(
    paste(res, collapse = "\n"),
    "Modifiable via modify_block:",
    fixed = TRUE
  )
})

test_that("a class-specific describe_block override is reached", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]
  class(blk) <- c("fake_block_for_test", class(blk))

  registerS3method(
    "describe_block", "fake_block_for_test",
    function(x, board, id, ...) "fake block override line",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("describe_block.fake_block_for_test", envir = globalenv())
    )
  )

  expect_identical(
    describe_block(blk, board = brd, id = "data"),
    "fake block override line"
  )
})

test_that("describe_block renders supplied state over constructor values", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["head"]]

  ctor <- paste(describe_block(blk, board = brd, id = "head"), collapse = "\n")

  live <- paste(
    describe_block(
      blk, board = brd, id = "head",
      state = list(n = 11L, direction = "head")
    ),
    collapse = "\n"
  )

  expect_match(ctor, "Initial block state:", fixed = TRUE)
  expect_no_match(ctor, "int 11", fixed = TRUE)

  expect_match(live, "Block state:", fixed = TRUE)
  expect_match(live, "int 11", fixed = TRUE)
})

test_that("a describe_block override absorbs state through its dots", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]
  class(blk) <- c("fake_block_for_test", class(blk))

  registerS3method(
    "describe_block", "fake_block_for_test",
    function(x, board, id, ...) "fake block override line",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("describe_block.fake_block_for_test", envir = globalenv())
    )
  )

  expect_identical(
    describe_block(
      blk, board = brd, id = "data", state = list(dataset = "mtcars")
    ),
    "fake block override line"
  )
})

test_that("live_block_state evaluates the block's reactive state", {

  board <- reactiveValues(
    blocks = list(
      head = list(
        server = list(state = list(n = reactive(11L), direction = "head"))
      )
    )
  )

  expect_identical(
    live_block_state("head", board),
    list(n = 11L, direction = "head")
  )
})

test_that("live_block_state returns NULL for an unconstructed block", {

  board <- reactiveValues(blocks = list())

  expect_null(live_block_state("head", board))
})

test_that("elide_long_values drops a value str() would cut", {

  long  <- strrep("z", 300L)
  state <- elide_long_values(list(script = long, n = 11L, keep = "short"))

  expect_match(state$script, "300 chars omitted", fixed = TRUE)
  expect_match(state$script, "get_block_state", fixed = TRUE)
  expect_no_match(state$script, "zzz", fixed = TRUE)
  expect_identical(state$keep, "short")
  expect_identical(state$n, 11L)
})

test_that("elide_long_values measures the escaped rendering str() cuts on", {

  # 120 source characters, but 182 once escaped -- str() truncates it, so
  # counting source characters would let it through as a prefix.
  esc <- strrep("a\"b\\c\n", 20L)

  expect_lt(nchar(esc), state_value_max_chars())
  expect_gt(nchar(encodeString(esc, quote = "\"")), state_value_max_chars())
  expect_match(
    elide_long_values(list(x = esc))$x, "chars omitted", fixed = TRUE
  )
})

test_that("elide_long_values leaves a value str() would show whole", {

  short <- strrep("z", 100L)

  expect_identical(elide_long_values(list(x = short))$x, short)
})

test_that("elide_long_values reaches into nested lists and vectors", {

  long  <- strrep("z", 300L)
  state <- elide_long_values(
    list(conditions = list(list(expr = long), list(expr = "ok")))
  )

  expect_match(state$conditions[[1L]]$expr, "chars omitted", fixed = TRUE)
  expect_identical(state$conditions[[2L]]$expr, "ok")

  vec <- elide_long_values(list(x = c("ok", long)))$x

  expect_length(vec, 2L)
  expect_identical(vec[[1L]], "ok")
  expect_match(vec[[2L]], "chars omitted", fixed = TRUE)
})

test_that("elide_long_values passes NA and non-character values through", {

  state <- elide_long_values(list(x = NA_character_, n = 1:3, f = TRUE))

  expect_identical(state$x, NA_character_)
  expect_identical(state$n, 1:3)
  expect_identical(state$f, TRUE)
})

test_that("bound_state_values returns character values whole", {

  script <- strrep("x <- 1; ", 400L)
  values <- bound_state_values(list(script = script, n = 11L))

  expect_identical(values$script, script)
  expect_identical(values$n, 11L)
})

test_that("bound_state_values spends one budget across the values", {

  values <- bound_state_values(
    list(a = strrep("a", 500L), b = strrep("b", 500L)),
    max_chars = 200L
  )

  expect_lte(nchar(values$a) + nchar(values$b), 260L)
  expect_match(values$a, "truncated", fixed = TRUE)
  expect_match(values$b, "truncated", fixed = TRUE)
})

test_that("bound_state_values renders a non-atomic value with str()", {

  values <- bound_state_values(list(data = head(iris, 3L)))

  expect_type(values$data, "character")
  expect_match(values$data, "3 obs", fixed = TRUE)
})

test_that("bound_state_values recurses into a nested list", {

  values <- bound_state_values(
    list(conditions = list(list(expr = "x > 1"), list(expr = "y < 2")))
  )

  expect_identical(values$conditions[[1L]]$expr, "x > 1")
  expect_identical(values$conditions[[2L]]$expr, "y < 2")
})

test_that("summary_block_state elides, and keeps NULL for no live state", {

  long  <- strrep("z", 300L)
  board <- reactiveValues(
    board  = make_iris_board(),
    blocks = list(
      head = list(server = list(state = list(direction = reactive(long))))
    )
  )

  expect_match(
    isolate(summary_block_state("head", board))$direction,
    "chars omitted",
    fixed = TRUE
  )
  expect_null(isolate(summary_block_state("data", board)))
})

test_that("map_state_values recurses into bare lists only", {

  seen <- list()
  state <- list(
    df     = head(iris, 2L),
    nested = list(a = "x", b = list(c = "y")),
    flat   = 1L
  )

  out <- map_state_values(state, function(x) {
    seen[[length(seen) + 1L]] <<- x
    x
  })

  # A classed list is a leaf: it reaches `f` whole rather than column by
  # column, and comes back with its class intact. Base rapply() descends into
  # it, which is why this walker exists.
  expect_true(any(vapply(seen, is.data.frame, logical(1L))))
  expect_s3_class(out$df, "data.frame")
  expect_identical(out$df, head(iris, 2L))

  # A bare list is a container, however deeply nested.
  expect_identical(out$nested$b$c, "y")
  expect_true("y" %in% seen)
  expect_false(any(vapply(seen, is.list, logical(1L)) &
                     !vapply(seen, is.object, logical(1L))))
})
