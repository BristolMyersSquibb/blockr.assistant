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

      expect_match(res@error, "was rejected", fixed = TRUE)
      expect_match(res@error, "cycle detected", fixed = TRUE)
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

      expect_match(res@error, "may be partly updated", fixed = TRUE)
      expect_match(res@error, "get_block_state", fixed = TRUE)
      expect_match(res@error, "boom", fixed = TRUE)
      expect_no_match(res@error, "was not changed", fixed = TRUE)
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

test_that("deferred_blocks picks out the blocks with no current check", {

  board <- reactiveValues(eval = list(a = "stale", b = "ready"))

  isolate({
    # This is the production failure: `a` is off screen and the commit edited
    # it, so it has not run since and reports no error.
    expect_identical(deferred_blocks(c("a", "b"), board), "a")

    board$eval <- list(a = "unevaluated", b = "ready")
    expect_identical(deferred_blocks(c("a", "b"), board), "a")

    # An off-screen block goes on reporting what its last check found, and
    # that is current until something the check read changes.
    board$eval <- list(a = "failed", b = "waiting")
    expect_identical(deferred_blocks(c("a", "b"), board), character())

    expect_identical(deferred_blocks(character(), board), character())

    # A block with no status yet has not been evaluated, as core reads it.
    board$eval <- list()
    expect_identical(deferred_blocks("a", board), "a")

    # A board reporting no statuses at all cannot say, so do not hold the
    # commit open to its timeout on every call.
    board$eval <- NULL
    expect_identical(deferred_blocks("a", board), character())
  })
})

test_that("a commit asks for what it reads back that is not current", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks = c(
      d = new_dataset_block("iris"),
      s = new_subset_block(),
      t = new_head_block()
    ),
    links = c(ds = new_link("d", "s", "data"), st = new_link("s", "t", "data"))
  )

  conds <- reactiveVal(cnd_frame())

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$modify_block(id = "s", args = '{"select": "Sepal.Length"}')

      p <- tools$commit()
      session$flushReact()

      board$blocks <- list(
        d = result_block(iris), s = result_block(NULL), t = result_block(NULL)
      )
      board$eval <- list(d = "ready", s = "stale", t = "stale")

      # Core drains the channel as it applies the commit. What lands there
      # after, a front-end's eager set say, is pending when the review asks.
      pending <- list(eager = list(dock = list(set = "d")))
      update(pending)

      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_, seq = 1L
      )

      # The edited block and the block it feeds, both off screen, asked for
      # alongside what was pending. The block feeding them is current, so
      # asking for it would change nothing.
      expect_null(drain_promise(p, session, tries = 3L))
      expect_identical(update(), c(pending, list(evaluate = c("s", "t"))))

      # The request's own outcome is not the commit's, and asks for nothing.
      update(NULL)
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_, seq = 2L
      )
      expect_null(drain_promise(p, session, tries = 3L))
      expect_null(update())

      board$blocks$s <- result_block(iris["Sepal.Length"])
      conds(cnd_frame(cnd_row("t", "error", "object 'Species' not found")))
      board$eval <- list(d = "ready", s = "ready", t = "failed")

      res <- drain_promise(p, session)

      expect_match(res, "- t:", fixed = TRUE)
      expect_match(res, "Block t conditions:", fixed = TRUE)
      expect_match(res, "object 'Species' not found", fixed = TRUE)
    },
    args = commit_board_args(brd, conds),
    session = with_llm_session()
  )
})

test_that("a commit that timed out cannot settle the next one", {

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

      board$blocks <- list(h = result_block(NULL))
      board$eval <- list(h = "unevaluated")
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_, seq = 1L
      )

      expect_match(
        drain_promise(p, session), "did not finish evaluating", fixed = TRUE
      )

      options(blockr.assistant_commit_timeout_secs = 60)

      tools$add_block(type = "head_block", args = "{}", id = "g")
      p <- tools$commit()
      session$flushReact()

      board$blocks <- list(h = result_block(NULL), g = result_block(NULL))
      board$eval <- list(h = "unevaluated", g = "unevaluated")
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_, seq = 2L
      )

      expect_null(drain_promise(p, session, tries = 3L))

      # The first commit's block runs at last. What this commit reads back has
      # not, so it is still waiting.
      board$eval <- list(h = "ready", g = "unevaluated")
      expect_null(drain_promise(p, session, tries = 3L))

      board$blocks$g <- result_block(data.frame(x = 1:3))
      board$eval <- list(h = "ready", g = "ready")

      expect_match(drain_promise(p, session), "- g:", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("a changed block with no result is reported as unverified", {

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  board <- reactiveValues(
    board = brd,
    blocks = list(d = result_block(NULL)),
    eval = list(d = "unevaluated"),
    conditions = reactiveVal(cnd_frame())
  )

  isolate({
    line <- review_result_line("d", board, character(), changed = "d")

    expect_match(line, "UNVERIFIED", fixed = TRUE)
    expect_match(line, "Do not report it as done", fixed = TRUE)

    # A neighbour is not something the model changed, so it gets the browse
    # gloss and no claim about what the model built.
    expect_no_match(
      review_result_line("d", board, character()), "UNVERIFIED", fixed = TRUE
    )

    # A block that raised did run, and its error is the verdict.
    board$eval <- list(d = "failed")
    expect_no_match(
      review_result_line("d", board, character(), changed = "d"),
      "UNVERIFIED", fixed = TRUE
    )
  })
})

test_that("a commit reads back an off-screen block that raises", {

  live <- local_live_client()

  brd <- new_board(blocks = c(data = new_dataset_block("iris")))

  testServer(
    getS3method("board_server", "board"),
    {
      session$flushReact()

      tools <- live$client$get_tools()

      tools$add_block(
        type = "subset_block", args = '{"subset": "no_such_col > 1"}',
        id = "bad"
      )
      tools$add_link(from = "data", to = "bad", input = "data")

      res <- drain_promise(tools$commit(), session)

      expect_identical(eval_status("bad", rv), "failed")
      expect_match(res, "Block bad conditions:", fixed = TRUE)
      expect_no_match(res, "unevaluated", fixed = TRUE)

      # A one-off request, spent once the block has run: nothing holds it
      # evaluated after the review, and it goes on reporting what it found.
      expect_length(rv$evaluating(), 0L)
      expect_identical(unlst(rv$eager_blocks()), "data")
    },
    args = assistant_board_args(brd, visible = "data")
  )
})

test_that("a commit reads back an off-screen block its edit breaks", {

  live <- local_live_client()

  brd <- new_board(
    blocks = c(
      data = new_dataset_block("iris"),
      up = new_subset_block(subset = "Sepal.Length > 5"),
      down = new_subset_block(subset = "Species == 'setosa'")
    ),
    links = c(
      a = new_link("data", "up", "data"),
      b = new_link("up", "down", "data")
    )
  )

  testServer(
    getS3method("board_server", "board"),
    {
      session$flushReact()

      board_update(list(evaluate = "down"))
      session$flushReact()

      expect_identical(eval_status("down", rv), "ready")

      tools <- live$client$get_tools()
      tools$modify_block(id = "up", args = '{"select": "Sepal.Length"}')

      res <- drain_promise(tools$commit(), session)

      # The block the model changed ran and is fine. The one it feeds, which
      # nobody is looking at either, is what broke.
      expect_identical(eval_status("up", rv), "ready")
      expect_identical(eval_status("down", rv), "failed")
      expect_match(res, "Block down conditions:", fixed = TRUE)
      expect_match(res, "Species", fixed = TRUE)
    },
    args = assistant_board_args(brd, visible = "data")
  )
})
