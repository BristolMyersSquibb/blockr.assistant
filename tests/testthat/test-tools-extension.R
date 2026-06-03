new_doc_extension <- function(content = "", title = "", description = NULL) {
  new_dock_extension(
    server = function(id, ...) {
      moduleServer(
        id,
        function(input, output, session) {
          list(
            state = list(
              content = reactiveVal(content),
              title   = reactiveVal(title)
            )
          )
        }
      )
    },
    ui = function(id) tagList(),
    name = "Document",
    description = description,
    class = "doc_extension",
    ctor = function(content = "", title = "") NULL,
    external_ctrl = TRUE
  )
}

make_ext_tool_board <- function(description = NULL) {
  new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    extensions = as_dock_extensions(
      list(new_doc_extension(content = "# old", description = description))
    )
  )
}

new_ext_tool_env <- function(brd = make_ext_tool_board()) {
  list(
    pending = reactiveVal(empty_pending()),
    board   = reactiveValues(board = brd)
  )
}

fake_peers <- function(content = "# live") {
  peers <- new.env(parent = emptyenv())
  peers$doc_extension <- list(state = list(content = reactiveVal(content)))
  peers
}

test_that("list_extensions reports id, name, controllable vars, live values", {

  env <- new_ext_tool_env()
  le  <- tool_list_extensions(env$board, fake_peers("# live"), session = NULL)

  out <- le()

  expect_length(out, 1L)

  entry <- out[[1L]]
  expect_identical(entry$id, "doc_extension")
  expect_identical(entry$name, "Document")
  expect_false("description" %in% names(entry))
  expect_setequal(entry$controllable, c("content", "title"))
  expect_named(entry$values, "content")
  expect_identical(entry$values$content, "# live")
})

test_that("list_extensions surfaces an extension description when present", {

  env <- new_ext_tool_env(
    make_ext_tool_board(description = "Embed block results via blockr://<id>.")
  )
  le  <- tool_list_extensions(env$board, extensions = NULL, session = NULL)

  expect_identical(
    le()[[1L]]$description,
    "Embed block results via blockr://<id>."
  )
})

test_that("list_extensions lists controllable vars without a live peer env", {

  env <- new_ext_tool_env()
  le  <- tool_list_extensions(env$board, extensions = NULL, session = NULL)

  out <- le()

  expect_length(out, 1L)
  expect_setequal(out[[1L]]$controllable, c("content", "title"))
  expect_length(out[[1L]]$values, 0L)
})

test_that("list_extensions returns an empty list on a non-dock board", {

  board <- reactiveValues(
    board = new_board(blocks = c(a = new_dataset_block("iris")))
  )

  le <- tool_list_extensions(board, extensions = NULL, session = NULL)

  expect_length(le(), 0L)
})

test_that("modify_extension stages a controllable delta", {

  env <- new_ext_tool_env()
  me  <- tool_modify_extension(env$board, env$pending, session = NULL)

  res <- me(id = "doc_extension", args = "{\"content\": \"# new\"}")

  expect_match(res, "Staged modify_extension(doc_extension)", fixed = TRUE)
  expect_identical(
    isolate(env$pending()$extensions$mod$doc_extension$content),
    "# new"
  )
})

test_that("modify_extension rejects an empty args object without staging", {

  env <- new_ext_tool_env()
  me  <- tool_modify_extension(env$board, env$pending, session = NULL)

  res <- me(id = "doc_extension", args = "{}")

  expect_match(res, "^modify_extension failed:")
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("modify_extension rejects a non-controllable key at stage time", {

  env <- new_ext_tool_env()
  me  <- tool_modify_extension(env$board, env$pending, session = NULL)

  res <- me(id = "doc_extension", args = "{\"bogus\": 1}")

  expect_match(res, "modify_extension\\(doc_extension\\) failed:")
  expect_false(has_any_changes(isolate(env$pending())))
})

test_that("modify_extension rejects an unknown extension id", {

  env <- new_ext_tool_env()
  me  <- tool_modify_extension(env$board, env$pending, session = NULL)

  res <- me(id = "ghost", args = "{\"content\": \"x\"}")

  expect_match(res, "modify_extension\\(ghost\\) failed:")
})
