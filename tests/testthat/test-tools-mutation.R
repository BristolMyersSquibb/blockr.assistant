make_mutation_board <- function() {
  new_board(
    blocks = c(
      data = new_dataset_block("iris"),
      head = new_head_block(external_ctrl = TRUE),
      tail = new_head_block(direction = "tail")
    ),
    links = c(lnk1 = new_link("data", "head", "data")),
    stacks = c(pipe = new_stack(c("data", "head"), name = "Pipeline"))
  )
}

new_mutation_env <- function(brd = make_mutation_board()) {

  list(
    pending = reactiveVal(empty_pending()),
    board   = reactiveValues(board = brd)
  )
}

test_that("merge_args is named-overwrite", {

  expect_equal(merge_args(list(), list(a = 1)), list(a = 1))
  expect_equal(merge_args(list(a = 1), list()), list(a = 1))
  expect_equal(
    merge_args(list(a = 1, b = 2), list(b = 99, c = 3)),
    list(a = 1, b = 99, c = 3)
  )
})

test_that("compact strips NULL entries", {

  expect_equal(
    compact(list(a = 1, b = NULL, c = "x")),
    list(a = 1, c = "x")
  )
  expect_length(compact(list(a = NULL, b = NULL)), 0L)
  expect_length(compact(list()), 0L)
})

test_that("existing_ids aggregates board, pending adds, mods, and rms", {

  env <- new_mutation_env()
  stage_block_add(env$pending, env$board, "extra", new_head_block())

  ids <- existing_ids(env$board, env$pending, "blocks")
  expect_true(all(c("data", "head", "extra") %in% ids))
  expect_false(anyDuplicated(ids) > 0L)
})

test_that("add_block stages a constructed block from JSON args", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(type = "head_block", args = "{\"n\": 5}", id = "new")

  expect_match(res, "Staged add_block(new)", fixed = TRUE)
  p <- isolate(env$pending())
  expect_named(p$blocks$add, "new")
  expect_s3_class(p$blocks$add[["new"]], "head_block")
})

test_that("add_block rejects arguments outside a block's documented set", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(type = "dataset_block", args = "{\"bogus\": 1}", id = "d2")

  expect_match(res, "unrecognized argument", fixed = TRUE)
  expect_match(res, "bogus", fixed = TRUE)
  expect_match(res, "dataset", fixed = TRUE)
  expect_false("d2" %in% names(isolate(env$pending()$blocks$add)))
})

test_that("add_block accepts a documented argument", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(
    type = "dataset_block", args = "{\"dataset\": \"mtcars\"}", id = "d2"
  )

  expect_match(res, "Staged add_block(d2)", fixed = TRUE)
})

test_that("parse_args_json keeps an array of objects as a list of records", {

  parsed <- parse_args_json(
    "{\"items\": [{\"type\": \"a\"}, {\"type\": \"b\"}]}", "add_block"
  )

  expect_type(parsed$items, "list")
  expect_false(is.data.frame(parsed$items))
  expect_identical(parsed$items[[1L]]$type, "a")
})

test_that("add_block surfaces a constructor error instead of throwing", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(
    type = "head_block", args = "{\"direction\": \"sideways\"}", id = "h2"
  )

  expect_match(res, "add_block")
  expect_match(res, "should be one of", fixed = TRUE)
  expect_false("h2" %in% names(isolate(env$pending()$blocks$add)))
})

test_that("add_link rejects an over-saturated input instead of throwing", {

  env <- new_mutation_env()
  add <- tool_add_link(env$board, env$pending, NULL)

  # head$data is already wired (lnk1: data -> head); a second link is rejected
  # at stage time rather than producing an unbuildable board.
  res <- add(from = "tail", to = "head", input = "data", id = "l2")

  expect_match(res, "add_link")
  expect_match(res, "failed", fixed = TRUE)
  expect_false("l2" %in% names(isolate(env$pending()$links$add)))
})

test_that("modify_block accepts a controllable argument", {

  env <- new_mutation_env()
  mod <- tool_modify_block(env$board, env$pending, NULL)

  res <- mod(id = "head", args = "{\"n\": 5}")

  expect_match(res, "Staged modify_block(head)", fixed = TRUE)
})

test_that("add_block surfaces JSON parse errors", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(type = "head_block", args = "{bad json}", id = "new")

  expect_match(res, "^add_block failed:")
  expect_length(isolate(env$pending()$blocks$add), 0L)
})

test_that("add_block rejects non-object JSON args", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  expect_match(
    add(type = "head_block", args = "[1,2,3]", id = "a"),
    "must be a JSON object"
  )
  expect_match(
    add(type = "head_block", args = "\"scalar\"", id = "b"),
    "must be a JSON object"
  )
  expect_length(isolate(env$pending()$blocks$add), 0L)
})

test_that("add_block treats null and empty args as no args", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  expect_match(
    add(type = "head_block", args = "null", id = "n"),
    "^Staged"
  )
  expect_match(
    add(type = "head_block", args = "{}", id = "e"),
    "^Staged"
  )
})

test_that("add_block surfaces unknown block type with discoverable hint", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(type = "not_a_block", args = "{}", id = "new")

  expect_match(res, "^add_block failed:")
  expect_match(res, "unknown block type")
  expect_match(res, "list_available_blocks")
})

test_that("add_block generates an id when omitted", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(type = "head_block", args = "{}")

  expect_match(res, "Staged add_block\\([^)]+\\)")
  p <- isolate(env$pending())
  expect_length(p$blocks$add, 1L)
  expect_false(names(p$blocks$add) %in% c("data", "head"))
})

test_that("add_block rejects a duplicate id via core's validator", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)

  res <- add(type = "head_block", args = "{}", id = "head")

  expect_match(res, "^add_block")
  expect_match(res, "failed")
})

test_that("remove_block stages a removal", {

  env <- new_mutation_env()
  rm <- tool_remove_block(env$board, env$pending, NULL)

  res <- rm(id = "head")

  expect_match(res, "Staged remove_block(head)", fixed = TRUE)
  expect_equal(isolate(env$pending()$blocks$rm), "head")
})

test_that("remove_block on unknown id fails via the validator", {

  env <- new_mutation_env()
  rm <- tool_remove_block(env$board, env$pending, NULL)

  res <- rm(id = "bogus")

  expect_match(res, "^remove_block")
  expect_match(res, "failed")
})

test_that("modify_block stages a delta against a committed block", {

  env <- new_mutation_env()
  mod <- tool_modify_block(env$board, env$pending, NULL)

  res <- mod(id = "head", args = "{\"n\": 9}")

  expect_match(res, "Staged modify_block(head)", fixed = TRUE)
  expect_equal(
    isolate(env$pending()$blocks$mod[["head"]]),
    list(n = 9L)
  )
})

test_that("modify_block rejects an empty delta", {

  env <- new_mutation_env()
  mod <- tool_modify_block(env$board, env$pending, NULL)

  expect_match(
    mod(id = "head", args = "{}"),
    "no fields supplied"
  )
  expect_length(isolate(env$pending()$blocks$mod), 0L)
})

test_that("modify_block rejects against a pending add (recovery message)", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)
  mod <- tool_modify_block(env$board, env$pending, NULL)

  add(type = "head_block", args = "{}", id = "new")
  res <- mod(id = "new", args = "{\"n\": 9}")

  expect_match(res, "staged for creation")
  expect_match(res, "remove_block")
  expect_match(res, "add_block")
})

test_that("modify_block rejects when the delta key is not ctrl-able", {

  env <- new_mutation_env()
  mod <- tool_modify_block(env$board, env$pending, NULL)

  res <- mod(id = "data", args = "{\"package\": \"utils\"}")

  expect_match(res, "^modify_block")
  expect_match(res, "not externally controllable")
})

test_that("add_link constructs a link and stages it", {

  env <- new_mutation_env()
  add <- tool_add_link(env$board, env$pending, NULL)

  res <- add(from = "data", to = "tail", input = "data", id = "ln")

  expect_match(res, "Staged add_link(ln:", fixed = TRUE)
  expect_named(isolate(env$pending()$links$add), "ln")
})

test_that("remove_link stages a removal", {

  env <- new_mutation_env()
  rm <- tool_remove_link(env$board, env$pending, NULL)

  res <- rm(id = "lnk1")

  expect_match(res, "Staged remove_link(lnk1)", fixed = TRUE)
  expect_equal(isolate(env$pending()$links$rm), "lnk1")
})

test_that("modify_link stages a partial delta and rejects when empty", {

  env <- new_mutation_env()
  mod <- tool_modify_link(env$board, env$pending, NULL)

  res <- mod(id = "lnk1", input = "data")
  expect_match(res, "Staged modify_link(lnk1)", fixed = TRUE)

  empty <- mod(id = "lnk1")
  expect_match(empty, "^modify_link failed:")
})

test_that("add_stack constructs a stack and stages it", {

  env <- new_mutation_env()
  add <- tool_add_stack(env$board, env$pending, NULL)

  res <- add(blocks = "tail", name = "P2", id = "st")

  expect_match(res, "Staged add_stack(st)", fixed = TRUE)
  expect_named(isolate(env$pending()$stacks$add), "st")
})

test_that("remove_stack stages a removal", {

  env <- new_mutation_env()
  rm <- tool_remove_stack(env$board, env$pending, NULL)

  res <- rm(id = "pipe")

  expect_match(res, "Staged remove_stack(pipe)", fixed = TRUE)
  expect_equal(isolate(env$pending()$stacks$rm), "pipe")
})

test_that("modify_stack stages a partial delta and rejects when empty", {

  env <- new_mutation_env()
  mod <- tool_modify_stack(env$board, env$pending, NULL)

  res <- mod(id = "pipe", name = "Renamed")
  expect_match(res, "Staged modify_stack(pipe)", fixed = TRUE)

  empty <- mod(id = "pipe")
  expect_match(empty, "^modify_stack failed:")
})

test_that("recovery sequence flushes one corrected add", {

  env <- new_mutation_env()
  add <- tool_add_block(env$board, env$pending, NULL)
  mod <- tool_modify_block(env$board, env$pending, NULL)
  rm <- tool_remove_block(env$board, env$pending, NULL)

  expect_match(add(type = "head_block", args = "{}", id = "x"), "^Staged")
  expect_match(mod(id = "x", args = "{\"n\": 10}"), "^modify_block")
  expect_match(rm(id = "x"), "^Staged")
  expect_match(add(type = "head_block", args = "{}", id = "x"), "^Staged")

  p <- isolate(env$pending())
  expect_length(p$blocks$add, 1L)
  expect_named(p$blocks$add, "x")
  expect_length(p$blocks$rm, 0L)
  expect_length(p$blocks$mod, 0L)
})

test_that("register_mutation_tools registers nine tools on the client", {

  fake_client <- structure(
    list(),
    class = "fake_client"
  )
  registered <- list()

  fake_client$register_tool <- function(tool) {
    registered[[length(registered) + 1L]] <<- tool
    invisible()
  }

  env <- new_mutation_env()
  register_mutation_tools(fake_client, env$board, env$pending, NULL)

  expect_length(registered, 9L)
})
