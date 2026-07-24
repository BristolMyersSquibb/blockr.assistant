new_doc_extension <- function(content = "", title = "") {
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
    class = "doc_extension",
    ctor = function(content = "", title = "") NULL,
    external_ctrl = TRUE
  )
}

make_ext_board <- function() {
  new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    extensions = list(doc_extension = new_doc_extension(content = "# old"))
  )
}

new_ext_env <- function(brd = make_ext_board()) {
  list(
    pending = reactiveVal(empty_pending()),
    board   = reactiveValues(board = brd)
  )
}

test_that("stage_extension_mod stages a controllable delta", {

  env <- new_ext_env()

  stage_extension_mod(
    env$pending, env$board, "doc_extension", list(content = "# new")
  )

  p <- isolate(env$pending())

  expect_named(p$extensions$mod, "doc_extension")
  expect_identical(p$extensions$mod$doc_extension$content, "# new")
})

test_that("stage_extension_mod merges successive deltas for one id", {

  env <- new_ext_env()

  stage_extension_mod(
    env$pending, env$board, "doc_extension", list(content = "# a")
  )
  stage_extension_mod(
    env$pending, env$board, "doc_extension", list(title = "T")
  )

  p <- isolate(env$pending())

  expect_identical(
    p$extensions$mod$doc_extension,
    list(content = "# a", title = "T")
  )
})

test_that("stage_extension_mod overwrites a re-staged key", {

  env <- new_ext_env()

  stage_extension_mod(
    env$pending, env$board, "doc_extension", list(content = "# a")
  )
  stage_extension_mod(
    env$pending, env$board, "doc_extension", list(content = "# b")
  )

  expect_identical(
    isolate(env$pending()$extensions$mod$doc_extension$content),
    "# b"
  )
})

test_that("stage_extension_mod rejects an unknown extension id", {

  env <- new_ext_env()

  expect_error(
    stage_extension_mod(
      env$pending, env$board, "ghost", list(content = "x")
    ),
    "modify_extension(ghost) failed:",
    fixed = TRUE
  )
})

test_that("stage_extension_mod rejects a non-controllable key", {

  env <- new_ext_env()

  expect_error(
    stage_extension_mod(
      env$pending, env$board, "doc_extension", list(bogus = 1)
    ),
    "modify_extension(doc_extension) failed:",
    fixed = TRUE
  )
})
