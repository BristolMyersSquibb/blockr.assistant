commit_board_args <- function(brd, conds, blocks = list()) {
  list(
    board = reactiveValues(
      board = brd, last_update = NULL, blocks = blocks, conditions = conds
    ),
    update = reactiveVal()
  )
}

result_block <- function(value) {
  list(server = list(result = function() value))
}

drain_promise <- function(p, session, tries = 60L) {

  box <- new.env()
  box$done <- FALSE

  promises::then(
    p,
    function(v) {
      box$val <- v
      box$done <- TRUE
    },
    function(e) {
      box$err <- e
      box$done <- TRUE
    }
  )

  for (i in seq_len(tries)) {
    session$flushReact()
    later::run_now()
    if (isTRUE(box$done)) break
  }

  if (!is.null(box$err)) {
    stop(box$err)
  }

  box$val
}

test_that("tool_commit builds a no-argument tool named commit", {

  tool <- tool_commit(function() "ok")

  expect_identical(tool@name, "commit")
  expect_length(tool@arguments@properties, 0L)
})

test_that("commit result headers carry the right framing", {

  expect_match(commit_header(), "now applied", fixed = TRUE)
  expect_match(commit_reject_header(), "was not changed", fixed = TRUE)
  expect_match(commit_clean_note(), "No block results", fixed = TRUE)
  expect_match(commit_timeout_note(), "did not finish evaluating", fixed = TRUE)
})

test_that("format_flush_feedback uses the supplied header", {

  msg <- format_flush_feedback(
    list(ok = TRUE),
    cnd_frame(),
    results = c("Results:", "- a:\n3 rows"),
    header = "[custom header]"
  )

  expect_match(msg, "[custom header]", fixed = TRUE)
  expect_no_match(msg, "Automatic board check", fixed = TRUE)
})

test_that("commit is a no-op when nothing is staged", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      res <- client_r()$get_tools()$commit()

      expect_false(promises::is.promise(res))
      expect_match(res, "Nothing is staged", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("commit applies staged changes and returns the review in-band", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      p <- tools$commit()
      expect_true(promises::is.promise(p))

      session$flushReact()

      board$blocks <- list(h = result_block(data.frame(x = 1:3)))
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_
      )

      res <- drain_promise(p, session)

      expect_match(res, "Result of your commit", fixed = TRUE)
      expect_match(res, "the staged changes are now applied", fixed = TRUE)
      expect_match(res, "- h:", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("commit surfaces a clean apply that touched no block results", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      p <- tools$commit()
      session$flushReact()

      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_
      )

      res <- drain_promise(p, session)

      expect_match(res, "No block results or new problems", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("commit reports a rejected update in-band without falling through", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      p <- tools$commit()
      session$flushReact()

      board$last_update <- list(
        ok = FALSE, phase = "validate", message = "cycle detected"
      )

      res <- drain_promise(p, session)

      expect_match(res, "was rejected", fixed = TRUE)
      expect_match(res, "cycle detected", fixed = TRUE)
      expect_null(isolate(report$feedback))
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("commit resolves with a timeout note when the board never settles", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.assistant_commit_timeout_secs = 0
  )

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      p <- tools$commit()

      res <- drain_promise(p, session)

      expect_match(
        res, "did not finish evaluating within the time limit",
        fixed = TRUE
      )
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})
