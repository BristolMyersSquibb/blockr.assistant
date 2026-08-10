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
    extensions = list(
      doc_extension = new_doc_extension(
        content = "# old", description = description
      )
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

test_that("list_extensions reports lean id, name, controllable vars", {

  env <- new_ext_tool_env()
  le  <- tool_list_extensions(env$board, fake_peers("# live"), session = NULL)

  out <- le()

  expect_length(out, 1L)

  entry <- out[[1L]]
  expect_identical(entry$id, "doc_extension")
  expect_identical(entry$name, "Document")
  expect_false("description" %in% names(entry))
  expect_false("values" %in% names(entry))
  expect_setequal(entry$controllable, c("content", "title"))
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
})

test_that("list_extensions returns an empty list on a non-dock board", {

  board <- reactiveValues(
    board = new_board(blocks = c(a = new_dataset_block("iris")))
  )

  le <- tool_list_extensions(board, extensions = NULL, session = NULL)

  expect_length(le(), 0L)
})

test_that("describe_extension reports live values for a controllable var", {

  env <- new_ext_tool_env()
  de  <- tool_describe_extension(
    env$board, fake_peers("# live"), session = NULL
  )

  out <- de(id = "doc_extension")

  expect_identical(out$id, "doc_extension")
  expect_identical(out$name, "Document")
  expect_setequal(out$controllable, c("content", "title"))
  expect_named(out$values, "content")
  expect_identical(out$values$content, "# live")
})

test_that("describe_extension surfaces the extension description", {

  env <- new_ext_tool_env(
    make_ext_tool_board(description = "Embed block results via blockr://<id>.")
  )
  de <- tool_describe_extension(env$board, extensions = NULL, session = NULL)

  expect_identical(
    de(id = "doc_extension")$description,
    "Embed block results via blockr://<id>."
  )
})

test_that("describe_extension returns a recovery hint for unknown id", {

  env <- new_ext_tool_env()
  de  <- tool_describe_extension(env$board, extensions = NULL, session = NULL)

  expect_match(de(id = "ghost"), "No extension with id ghost", fixed = TRUE)
})

test_that("describe_extension reports a non-dock board", {

  board <- reactiveValues(
    board = new_board(blocks = c(a = new_dataset_block("iris")))
  )
  de <- tool_describe_extension(board, extensions = NULL, session = NULL)

  expect_match(de(id = "whatever"), "not a dock board", fixed = TRUE)
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

test_that("describe_extension names the skills scoped to its class", {

  root <- local_skills_dir()

  write_skill(
    root, "doc-style",
    c("name: doc-style", "description: Write in the house voice.",
      "extensions:", "  - doc_extension")
  )
  write_skill(root, "global", c("name: global", "description: Everywhere."))

  env <- new_ext_tool_env()
  de  <- tool_describe_extension(env$board, NULL, session = NULL)

  res <- de(id = "doc_extension")

  expect_identical(
    res$skills,
    list(list(name = "doc-style", description = "Write in the house voice."))
  )
})

test_that("describe_extension omits skills when none are scoped to it", {

  local_skills_dir()

  env <- new_ext_tool_env()
  res <- tool_describe_extension(env$board, NULL, session = NULL)(
    id = "doc_extension"
  )

  expect_false("skills" %in% names(res))
})
