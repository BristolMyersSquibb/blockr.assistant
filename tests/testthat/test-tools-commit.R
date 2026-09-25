commit_board_args <- function(brd, conds, blocks = list(), eval = list()) {
  list(
    board = reactiveValues(
      board = brd, last_update = NULL, blocks = blocks, conditions = conds,
      # The commit claims the blocks it touched and waits for them to leave
      # `dormant` before reviewing, so a mock board has to carry statuses the
      # way core's rv does.
      eval = eval
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
      board$eval <- list(h = "ready")
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
      board$eval <- list(h = "ready")
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
      board$eval <- list(d = "ready")
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

# A payload that touches no block. It claims nothing, so there is nothing to
# wait for and nothing to report -- unlike a payload that adds or modifies a
# block, which is now held open until that block has run.
test_that("commit surfaces a clean apply that touched no block results", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks = c(d = new_dataset_block("iris")),
    stacks = stacks(s = new_stack("d"))
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$modify_stack(id = "s", name = "Renamed")

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

test_that("commit claims the blocks it touched, minus the ones it removes", {

  brd <- new_board(
    blocks = c(a = new_dataset_block("iris"), b = new_head_block()),
    links  = c(l = new_link("a", "b", "data"))
  )

  payload <- empty_pending()
  payload$blocks$mod <- list(b = list(n = 3L))

  expect_identical(commit_claim_ids(payload, brd), "b")

  payload$blocks$rm <- "b"
  expect_identical(commit_claim_ids(payload, brd), character())

  expect_identical(commit_claim_ids(empty_pending(), brd), character())
  expect_identical(commit_claim_ids(NULL, brd), character())
})

test_that("the claim states the assistant's whole set, so it replaces", {

  delta <- commit_claim_delta(c("a", "b"))

  expect_named(delta, "blockr.assistant")
  expect_identical(delta[["blockr.assistant"]], list(set = c("a", "b")))
  expect_identical(
    commit_claim_delta(character())[["blockr.assistant"]],
    list(set = character())
  )
})

test_that("a claimed block that has not run yet is not settled", {

  board <- reactiveValues(eval = list(a = "dormant", b = "ready"))

  isolate({
    # This is the production failure: `a` is off screen, so it holds no result
    # and reports no error, and reviewing now reads back a clean commit.
    expect_false(commit_settled("a", board))
    expect_false(commit_settled(c("a", "b"), board))

    expect_true(commit_settled("b", board))
    expect_true(commit_settled(character(), board))

    # `stale` is dormant with an upstream change on top of it.
    board$eval <- list(a = "stale")
    expect_false(commit_settled("a", board))

    # A block that raised HAS run; that is a verdict the review reports.
    board$eval <- list(a = "failed")
    expect_true(commit_settled("a", board))

    # A claimed block with no status yet is still on its way in.
    board$eval <- list()
    expect_false(commit_settled("a", board))

    # A board reporting no statuses at all cannot say, so do not hold the
    # commit open to its timeout on every call.
    board$eval <- NULL
    expect_true(commit_settled("a", board))
  })
})

test_that("the commit payload carries the claim over the touched blocks", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      tools$commit()
      session$flushReact()

      expect_identical(
        update()$sustain,
        list(blockr.assistant = list(set = "h"))
      )
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("a commit waits for the blocks it claimed before reading back", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  conds <- reactiveVal(cnd_frame())

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()
      tools$add_block(type = "head_block", args = "{}", id = "h")

      p <- tools$commit()
      session$flushReact()

      board$eval <- list(h = "dormant")
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_
      )

      expect_null(drain_promise(p, session, tries = 3L))

      board$blocks <- list(h = result_block(NULL))
      conds(cnd_frame(cnd_row("h", "error", "unused argument")))
      board$eval <- list(h = "failed")

      res <- drain_promise(p, session)

      expect_match(res, "Block h conditions:", fixed = TRUE)
      expect_match(res, "unused argument", fixed = TRUE)
    },
    args = commit_board_args(brd, conds),
    session = with_llm_session()
  )
})

test_that("the turn end releases a claim a later commit left in place", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks = c(d = new_dataset_block("iris")),
    stacks = stacks(s = new_stack("d"))
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      # Nothing was claimed, so there is nothing to release.
      on_model_turn(ellmer::Turn("assistant", "nothing to do"))
      session$flushReact()
      expect_null(update())

      tools <- client_r()$get_tools()

      tools$add_block(type = "head_block", args = "{}", id = "h")
      p <- tools$commit()
      session$flushReact()

      board$eval <- list(h = "ready")
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_, seq = 1L
      )
      drain_promise(p, session)

      # This commit touches no block, so it carries no claim and core keeps
      # holding `h`.
      tools$modify_stack(id = "s", name = "Renamed")
      p <- tools$commit()
      session$flushReact()

      expect_null(update()$sustain)

      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_, seq = 2L
      )
      drain_promise(p, session)

      on_model_turn(ellmer::Turn("assistant", "done"))
      session$flushReact()

      expect_identical(
        update(),
        list(sustain = list(blockr.assistant = list(set = character())))
      )
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
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

      board$eval <- list(h = "dormant")
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

      board$eval <- list(h = "dormant", g = "dormant")
      board$last_update <- list(
        ok = TRUE, phase = "apply", message = NA_character_, seq = 2L
      )

      expect_null(drain_promise(p, session, tries = 3L))

      # The first commit's block runs at last. What this commit claimed has
      # not, so it is still waiting.
      board$eval <- list(h = "ready", g = "dormant")
      expect_null(drain_promise(p, session, tries = 3L))

      board$blocks <- list(g = result_block(data.frame(x = 1:3)))
      board$eval <- list(h = "ready", g = "ready")

      expect_match(drain_promise(p, session), "- g:", fixed = TRUE)
    },
    args = commit_board_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("a commit reads back an off-screen block that raises", {

  live <- new.env()
  mod <- fake_chat_mod()

  withr::local_options(
    blockr.chat_function = function(system_prompt = NULL, params = NULL) {
      live$client <- fake_chat_function(system_prompt, params)
      live$client
    },
    blockr.background_construction_delay = 0
  )

  testthat::local_mocked_bindings(
    chat_server = function(id, client, ...) mod,
    .package = "shinychat"
  )

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
      expect_no_match(res, "dormant", fixed = TRUE)

      # Held until the turn ends, then the board goes back to evaluating only
      # what is on screen.
      expect_identical(unlst(rv$claims()), "bad")

      mod$last_turn(ellmer::Turn("assistant", "done"))
      session$flushReact()

      expect_length(rv$claims(), 0L)
      expect_identical(eval_status("bad", rv), "dormant")
    },
    args = assistant_board_args(brd, visible = "data")
  )
})

test_that("a changed block with no result is reported as unverified", {

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  board <- reactiveValues(
    board = brd,
    blocks = list(d = result_block(NULL)),
    eval = list(d = "dormant"),
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
