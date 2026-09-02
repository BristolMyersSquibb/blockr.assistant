commit_board_args <- function(brd, conds, blocks = list()) {
  list(
    board = reactiveValues(
      board = brd, last_update = NULL, blocks = blocks, conditions = conds
    ),
    update = reactiveVal()
  )
}

result_block <- function(value, state = NULL) {
  list(server = list(result = function() value, state = state))
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

test_that("tool_discard builds a no-argument tool named discard", {

  tool <- tool_discard(reactiveVal(empty_pending()))

  expect_identical(tool@name, "discard")
  expect_length(tool@arguments@properties, 0L)
})

test_that("commit result headers carry the right framing", {

  expect_match(commit_header(), "now applied", fixed = TRUE)
  expect_match(
    commit_reject_header("validate"), "was not changed", fixed = TRUE
  )
  expect_match(commit_clean_note(), "No block results", fixed = TRUE)
  expect_match(commit_timeout_note(), "did not finish evaluating", fixed = TRUE)
})

test_that("commit_reject_header claims an unchanged board for validate only", {

  msg <- commit_reject_header("apply")

  expect_match(msg, "may be partly updated", fixed = TRUE)
  expect_match(msg, "Read back what landed", fixed = TRUE)
  expect_no_match(msg, "was not changed", fixed = TRUE)

  expect_no_match(
    commit_reject_header("something-else"), "was not changed", fixed = TRUE
  )
})

test_that("uncommitted_nudge offers commit or discard, not an auto-apply", {

  msg <- uncommitted_nudge()

  expect_match(msg, "never committed", fixed = TRUE)
  expect_match(msg, "commit", fixed = TRUE)
  expect_match(msg, "discard", fixed = TRUE)
  expect_no_match(msg, "applied automatically", fixed = TRUE)
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
    asst_ext_srv(system_prompt = default_system_prompt),
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

test_that("discard drops staged changes and leaves the board unchanged", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")
      expect_true(isolate(has_any_changes(pending_update())))

      res <- tools$discard()

      expect_match(res, "Discarded", fixed = TRUE)
      expect_false(isolate(has_any_changes(pending_update())))
      expect_null(isolate(board$last_update))
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("discard is a no-op when nothing is staged", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      res <- client_r()$get_tools()$discard()

      expect_match(res, "Nothing is staged to discard", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("commit applies staged changes and returns the review in-band", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
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

test_that("commit reads back the resolved state of a block it added", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      p <- tools$commit()
      session$flushReact()

      board$blocks <- list(
        h = result_block(
          data.frame(x = 1:3),
          list(n = function() 3L, direction = function() "head")
        )
      )
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_
      )

      res <- drain_promise(p, session)

      expect_match(res, "Applied state:", fixed = TRUE)
      expect_match(res, "int 3", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("commit reports no state for a block it only modified", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$modify_block(id = "d", args = '{"dataset": "mtcars"}')

      p <- tools$commit()
      session$flushReact()

      board$blocks <- list(
        d = result_block(mtcars, list(dataset = function() "mtcars"))
      )
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_
      )

      res <- drain_promise(p, session)

      expect_match(res, "- d:", fixed = TRUE)
      expect_no_match(res, "Applied state", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("commit surfaces a clean apply that touched no block results", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
      expect_null(isolate(report$nudge))

      expect_no_match(
        client_r()$get_system_prompt(), "previous turn", fixed = TRUE
      )
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("a commit that fails to apply is not reported as a clean reject", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      p <- tools$commit()
      session$flushReact()

      board$last_update <- list(
        ok = FALSE, phase = "apply", message = "boom"
      )

      res <- drain_promise(p, session)

      expect_match(res, "may be partly updated", fixed = TRUE)
      expect_match(res, "get_block_state", fixed = TRUE)
      expect_match(res, "boom", fixed = TRUE)
      expect_no_match(res, "was not changed", fixed = TRUE)
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
