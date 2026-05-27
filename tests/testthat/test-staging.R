make_staging_board <- function() {
  new_board(
    blocks = c(
      data  = new_dataset_block("iris"),
      head  = new_head_block(external_ctrl = TRUE),
      spare = new_head_block()
    ),
    links = c(lnk1 = new_link("data", "head", "data")),
    stacks = c(pipe = new_stack(c("data", "head"), name = "Pipeline"))
  )
}

new_pending_env <- function(brd = make_staging_board()) {

  list(
    pending = reactiveVal(empty_pending()),
    board   = reactiveValues(board = brd)
  )
}

test_that("empty_pending has the expected shape", {

  p <- empty_pending()

  expect_named(p, c("blocks", "links", "stacks", "views"))
  for (slot in c("blocks", "links", "stacks")) {
    expect_named(p[[slot]], c("add", "mod", "rm"))
    expect_length(p[[slot]]$add, 0L)
    expect_length(p[[slot]]$mod, 0L)
    expect_length(p[[slot]]$rm, 0L)
  }

  expect_named(p$views, c("add", "mod", "rm", "active"))
  expect_length(p$views$add, 0L)
  expect_length(p$views$mod, 0L)
  expect_length(p$views$rm, 0L)
  expect_null(p$views$active)
})

test_that("has_any_changes detects content in every slot", {

  p <- empty_pending()
  expect_false(has_any_changes(p))

  p$blocks$add <- set_names(blocks(new_head_block()), "x")
  expect_true(has_any_changes(p))

  p <- empty_pending()
  p$links$rm <- "lnk1"
  expect_true(has_any_changes(p))

  p <- empty_pending()
  p$stacks$mod <- list(y = list(name = "s"))
  expect_true(has_any_changes(p))

  p <- empty_pending()
  p$views$rm <- "V"
  expect_true(has_any_changes(p))

  p <- empty_pending()
  p$views$active <- "V"
  expect_true(has_any_changes(p))
})

test_that("reset_pending restores the empty payload", {

  pending <- reactiveVal(empty_pending())

  isolate({
    p <- pending()
    p$blocks$rm <- "x"
    pending(p)
    expect_true(has_any_changes(pending()))
  })

  reset_pending(pending)
  expect_false(isolate(has_any_changes(pending())))
})

test_that("format_stage_error wraps strings and conditions consistently", {

  expect_equal(
    format_stage_error("op", "id", "boom"),
    "op(id) failed: boom"
  )

  expect_equal(
    format_stage_error("op", "id", simpleError("boom")),
    "op(id) failed: boom"
  )
})

test_that("stage_block_add stages a new block", {

  env <- new_pending_env()

  stage_block_add(env$pending, env$board, "new", new_head_block())

  p <- isolate(env$pending())
  expect_named(p$blocks$add, "new")
  expect_s3_class(p$blocks$add[["new"]], "block")
})

test_that("stage_block_add rejects duplicate pending add", {

  env <- new_pending_env()
  stage_block_add(env$pending, env$board, "new", new_head_block())

  expect_error(
    stage_block_add(env$pending, env$board, "new", new_head_block()),
    "add_block(new) failed: id is already staged for creation",
    fixed = TRUE
  )
})

test_that("stage_block_add rejects when id is pending mod", {

  env <- new_pending_env()
  stage_block_mod(env$pending, env$board, "head", list(n = 9L))

  expect_error(
    stage_block_add(env$pending, env$board, "head", new_head_block()),
    "staged for modification",
    fixed = TRUE
  )
})

test_that("stage_block_add rejects when id is pending rm", {

  env <- new_pending_env()
  stage_block_rm(env$pending, env$board, "head")

  expect_error(
    stage_block_add(env$pending, env$board, "head", new_head_block()),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_block_add rejects when board validator throws", {

  env <- new_pending_env()

  expect_error(
    stage_block_add(env$pending, env$board, "data", new_head_block()),
    "add_block(data) failed:",
    fixed = TRUE
  )
})

test_that("stage_block_mod rejects when id is pending add", {

  env <- new_pending_env()
  stage_block_add(env$pending, env$board, "new", new_head_block())

  expect_error(
    stage_block_mod(env$pending, env$board, "new", list(n = 9L)),
    "staged for creation",
    fixed = TRUE
  )
})

test_that("stage_block_mod merges deltas onto a pending mod (key-wise)", {

  env <- new_pending_env()
  stage_block_mod(env$pending, env$board, "head", list(n = 5L))
  stage_block_mod(env$pending, env$board, "head", list(direction = "tail"))

  p <- isolate(env$pending())
  expect_length(p$blocks$mod, 1L)
  expect_equal(p$blocks$mod[["head"]], list(n = 5L, direction = "tail"))
})

test_that("stage_block_mod overwrites duplicate keys (last-write-wins)", {

  env <- new_pending_env()
  stage_block_mod(env$pending, env$board, "head", list(n = 5L))
  stage_block_mod(env$pending, env$board, "head", list(n = 9L))

  p <- isolate(env$pending())
  expect_equal(p$blocks$mod[["head"]], list(n = 9L))
})

test_that("stage_block_mod rejects when id is pending rm", {

  env <- new_pending_env()
  stage_block_rm(env$pending, env$board, "head")

  expect_error(
    stage_block_mod(env$pending, env$board, "head", list(n = 5L)),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_block_rm collapses onto a pending add (drops add)", {

  env <- new_pending_env()
  stage_block_add(env$pending, env$board, "new", new_head_block())

  stage_block_rm(env$pending, env$board, "new")

  p <- isolate(env$pending())
  expect_length(p$blocks$add, 0L)
  expect_length(p$blocks$rm, 0L)
})

test_that("stage_block_rm discards a pending mod when staging rm", {

  env <- new_pending_env()
  stage_block_mod(env$pending, env$board, "head", list(n = 9L))

  stage_block_rm(env$pending, env$board, "head")

  p <- isolate(env$pending())
  expect_length(p$blocks$mod, 0L)
  expect_equal(p$blocks$rm, "head")
})

test_that("stage_block_rm rejects when id is already pending rm", {

  env <- new_pending_env()
  stage_block_rm(env$pending, env$board, "head")

  expect_error(
    stage_block_rm(env$pending, env$board, "head"),
    "already staged for removal",
    fixed = TRUE
  )
})

test_that("stage_block_rm rejects an unknown id via the validator", {

  env <- new_pending_env()

  expect_error(
    stage_block_rm(env$pending, env$board, "bogus"),
    "remove_block(bogus) failed:",
    fixed = TRUE
  )
})

test_that("stage_link_add stages, rejects duplicates, and collapses", {

  env <- new_pending_env()

  stage_link_add(
    env$pending, env$board, "new",
    new_link("data", "spare", "data")
  )
  expect_named(isolate(env$pending()$links$add), "new")

  expect_error(
    stage_link_add(
      env$pending, env$board, "new",
      new_link("data", "spare", "data")
    ),
    "already staged for creation",
    fixed = TRUE
  )

  stage_link_rm(env$pending, env$board, "new")
  expect_length(isolate(env$pending()$links$add), 0L)
  expect_length(isolate(env$pending()$links$rm), 0L)
})

test_that("stage_link_add rejects when id is pending mod or rm", {

  env <- new_pending_env()
  stage_link_mod(env$pending, env$board, "lnk1", list(input = "data"))

  expect_error(
    stage_link_add(
      env$pending, env$board, "lnk1",
      new_link("data", "spare", "data")
    ),
    "staged for modification",
    fixed = TRUE
  )

  env <- new_pending_env()
  stage_link_rm(env$pending, env$board, "lnk1")

  expect_error(
    stage_link_add(
      env$pending, env$board, "lnk1",
      new_link("data", "spare", "data")
    ),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_link_mod rejects against a pending add", {

  env <- new_pending_env()
  stage_link_add(
    env$pending, env$board, "new",
    new_link("data", "spare", "data")
  )

  expect_error(
    stage_link_mod(env$pending, env$board, "new", list(input = "data")),
    "staged for creation",
    fixed = TRUE
  )
})

test_that("stage_link_mod merges deltas key-wise on a pending mod", {

  env <- new_pending_env()

  stage_link_mod(env$pending, env$board, "lnk1", list(input = "data"))
  stage_link_mod(env$pending, env$board, "lnk1", list(to = "spare"))

  p <- isolate(env$pending())
  expect_length(p$links$mod, 1L)
  expect_equal(p$links$mod[["lnk1"]], list(input = "data", to = "spare"))
})

test_that("stage_link_mod rejects when id is pending rm", {

  env <- new_pending_env()
  stage_link_rm(env$pending, env$board, "lnk1")

  expect_error(
    stage_link_mod(
      env$pending, env$board, "lnk1",
      new_link("data", "head", "data")
    ),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_link_rm discards a pending mod when staging rm", {

  env <- new_pending_env()
  stage_link_mod(env$pending, env$board, "lnk1", list(input = "data"))

  stage_link_rm(env$pending, env$board, "lnk1")

  p <- isolate(env$pending())
  expect_length(p$links$mod, 0L)
  expect_equal(p$links$rm, "lnk1")
})

test_that("stage_link_rm rejects when id is already pending rm", {

  env <- new_pending_env()
  stage_link_rm(env$pending, env$board, "lnk1")

  expect_error(
    stage_link_rm(env$pending, env$board, "lnk1"),
    "already staged for removal",
    fixed = TRUE
  )
})

test_that("stage_stack_add stages a new stack", {

  env <- new_pending_env()

  stage_stack_add(
    env$pending, env$board, "new",
    new_stack("spare", name = "n")
  )

  expect_named(isolate(env$pending()$stacks$add), "new")
})

test_that("stage_stack_add rejects duplicates and pending mod / rm", {

  env <- new_pending_env()
  stage_stack_add(
    env$pending, env$board, "new",
    new_stack("spare", name = "n")
  )

  expect_error(
    stage_stack_add(
      env$pending, env$board, "new",
      new_stack("spare", name = "n")
    ),
    "already staged for creation",
    fixed = TRUE
  )

  env <- new_pending_env()
  stage_stack_mod(env$pending, env$board, "pipe", list(name = "renamed"))

  expect_error(
    stage_stack_add(
      env$pending, env$board, "pipe",
      new_stack("spare", name = "n")
    ),
    "staged for modification",
    fixed = TRUE
  )

  env <- new_pending_env()
  stage_stack_rm(env$pending, env$board, "pipe")

  expect_error(
    stage_stack_add(
      env$pending, env$board, "pipe",
      new_stack("spare", name = "n")
    ),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_stack_mod rejects against a pending add", {

  env <- new_pending_env()
  stage_stack_add(
    env$pending, env$board, "new",
    new_stack("spare", name = "n")
  )

  expect_error(
    stage_stack_mod(env$pending, env$board, "new", list(name = "renamed")),
    "staged for creation",
    fixed = TRUE
  )
})

test_that("stage_stack_mod merges deltas key-wise on a pending mod", {

  env <- new_pending_env()
  stage_stack_mod(env$pending, env$board, "pipe", list(name = "first"))
  stage_stack_mod(env$pending, env$board, "pipe", list(blocks = "data"))

  p <- isolate(env$pending())
  expect_length(p$stacks$mod, 1L)
  expect_equal(
    p$stacks$mod[["pipe"]],
    list(name = "first", blocks = "data")
  )
})

test_that("stage_stack_mod rejects unknown id and pending rm", {

  env <- new_pending_env()

  expect_error(
    stage_stack_mod(env$pending, env$board, "missing", list(name = "x")),
    "modify_stack(missing) failed:",
    fixed = TRUE
  )

  env <- new_pending_env()
  stage_stack_rm(env$pending, env$board, "pipe")

  expect_error(
    stage_stack_mod(env$pending, env$board, "pipe", list(name = "x")),
    "staged for removal",
    fixed = TRUE
  )
})

test_that("stage_stack_rm collapses onto a pending add (drops it)", {

  env <- new_pending_env()
  stage_stack_add(
    env$pending, env$board, "new",
    new_stack("spare", name = "n")
  )

  stage_stack_rm(env$pending, env$board, "new")

  p <- isolate(env$pending())
  expect_length(p$stacks$add, 0L)
  expect_length(p$stacks$rm, 0L)
})

test_that("stage_stack_rm discards a pending mod when staging rm", {

  env <- new_pending_env()
  stage_stack_mod(env$pending, env$board, "pipe", list(name = "renamed"))

  stage_stack_rm(env$pending, env$board, "pipe")

  p <- isolate(env$pending())
  expect_length(p$stacks$mod, 0L)
  expect_equal(p$stacks$rm, "pipe")
})

test_that("stage_stack_rm rejects an already-pending rm", {

  env <- new_pending_env()
  stage_stack_rm(env$pending, env$board, "pipe")

  expect_error(
    stage_stack_rm(env$pending, env$board, "pipe"),
    "already staged for removal",
    fixed = TRUE
  )
})

test_that("flush_pending is a no-op on empty pending", {

  pending <- reactiveVal(empty_pending())
  calls <- 0L
  fake_update <- function(payload) calls <<- calls + 1L

  res <- flush_pending(pending, fake_update)

  expect_false(res)
  expect_identical(calls, 0L)
  expect_false(isolate(has_any_changes(pending())))
})

test_that("flush_pending dispatches once and resets pending", {

  env <- new_pending_env()
  stage_block_add(env$pending, env$board, "new", new_head_block())

  captured <- NULL
  calls <- 0L
  fake_update <- function(payload) {
    calls <<- calls + 1L
    captured <<- payload
  }

  res <- flush_pending(env$pending, fake_update)

  expect_true(res)
  expect_identical(calls, 1L)
  expect_named(captured$blocks$add, "new")
  expect_false(isolate(has_any_changes(env$pending())))
})

test_that("flush_pending resets pending even when update() throws", {

  env <- new_pending_env()
  stage_block_add(env$pending, env$board, "new", new_head_block())

  fake_update <- function(payload) stop("boom")

  expect_warning(
    flush_pending(env$pending, fake_update),
    "dispatch rejected payload"
  )

  expect_false(isolate(has_any_changes(env$pending())))
})

test_that("flush_pending populates last_flush_error on rejection", {

  env <- new_pending_env()
  stage_block_add(env$pending, env$board, "new", new_head_block())

  fake_update <- function(payload) stop("validator rejected payload")
  last_flush_error <- reactiveVal(NULL)

  expect_warning(
    flush_pending(env$pending, fake_update, last_flush_error),
    "dispatch rejected payload"
  )

  expect_identical(
    isolate(last_flush_error()), "validator rejected payload"
  )
})

test_that("flush_pending clears last_flush_error on a successful dispatch", {

  env <- new_pending_env()
  stage_block_add(env$pending, env$board, "new", new_head_block())

  fake_update <- function(payload) invisible(payload)
  last_flush_error <- reactiveVal("a prior rejection")

  flush_pending(env$pending, fake_update, last_flush_error)

  expect_null(isolate(last_flush_error()))
})

test_that("flush_pending no-op also clears last_flush_error", {

  pending <- reactiveVal(empty_pending())
  fake_update <- function(payload) stop("never called")
  last_flush_error <- reactiveVal("a prior rejection that should clear")

  res <- flush_pending(pending, fake_update, last_flush_error)

  expect_false(res)
  expect_null(isolate(last_flush_error()))
})
