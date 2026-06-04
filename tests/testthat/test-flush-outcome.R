mk_block_cnd <- function(x) {
  structure(x, id = x, class = "block_cnd")
}

cond_rv <- function(...) {
  do.call(shiny::reactiveValues, list(...))
}

fake_block <- function(cond = NULL) {
  list(server = list(cond = cond))
}

eval_error <- function(msg) {
  list(eval = list(error = list(mk_block_cnd(msg)), warning = list(),
                   message = list()))
}

test_that("condition_keys is empty for a 0-row frame", {
  expect_identical(condition_keys(summarise_conditions(list())), character())
})

test_that("new_block_conditions returns conditions absent from the baseline", {

  base <- list(a = summarise_conditions(list()))
  cur <- list(a = summarise_conditions(eval_error("boom")))

  fresh <- new_block_conditions(base, cur)

  expect_named(fresh, "a")
  expect_identical(fresh$a$message, "boom")
})

test_that("new_block_conditions ignores a pre-existing condition", {

  df <- summarise_conditions(eval_error("boom"))

  expect_length(new_block_conditions(list(a = df), list(a = df)), 0L)
})

test_that("new_block_conditions reports every condition of a new block", {

  cur <- list(b = summarise_conditions(eval_error("new")))

  expect_named(new_block_conditions(list(), cur), "b")
})

test_that("new_block_conditions drops a block whose conditions cleared", {

  base <- list(a = summarise_conditions(eval_error("boom")))
  cur <- list(a = summarise_conditions(list()))

  expect_length(new_block_conditions(base, cur), 0L)
})

test_that("new_block_conditions isolates the newly added condition", {

  base <- list(
    a = summarise_conditions(
      list(eval = list(warning = list(mk_block_cnd("old"))))
    )
  )
  cur <- list(
    a = summarise_conditions(
      list(
        eval = list(
          warning = list(mk_block_cnd("old")),
          error = list(mk_block_cnd("new"))
        )
      )
    )
  )

  fresh <- new_block_conditions(base, cur)

  expect_identical(fresh$a$message, "new")
})

test_that("format_flush_feedback reports a rejected board update", {

  msg <- format_flush_feedback(
    list(ok = FALSE, phase = "validate", message = "cycle detected"),
    list()
  )

  expect_match(msg, "rejected during the validate phase", fixed = TRUE)
  expect_match(msg, "cycle detected", fixed = TRUE)
})

test_that("format_flush_feedback reports an apply-phase failure", {

  msg <- format_flush_feedback(
    list(ok = FALSE, phase = "apply", message = "boom"),
    list()
  )

  expect_match(msg, "apply phase", fixed = TRUE)
})

test_that("format_flush_feedback reports newly broken blocks", {

  fresh <- list(a = summarise_conditions(eval_error("object 'x' not found")))

  msg <- format_flush_feedback(
    list(ok = TRUE, phase = "apply", message = NA_character_),
    fresh
  )

  expect_match(msg, "some blocks now report problems", fixed = TRUE)
  expect_match(msg, "object 'x' not found", fixed = TRUE)
})

test_that("format_flush_feedback is NULL for a clean apply", {

  expect_null(
    format_flush_feedback(
      list(ok = TRUE, phase = "apply", message = NA_character_),
      list()
    )
  )
})

test_that("format_flush_feedback combines a rejection and new conditions", {

  fresh <- list(a = summarise_conditions(eval_error("boom")))

  msg <- format_flush_feedback(
    list(ok = FALSE, phase = "apply", message = "partial"),
    fresh
  )

  expect_match(msg, "rejected", fixed = TRUE)
  expect_match(msg, "boom", fixed = TRUE)
})

test_that("snapshot_conditions is empty on a board with no blocks", {

  expect_identical(snapshot_conditions(shiny::reactiveValues()), list())
})

test_that("snapshot_conditions reads per-block error and warning conditions", {

  board <- shiny::reactiveValues(
    blocks = list(
      a = fake_block(cond_rv(eval = eval_error("boom")$eval)),
      b = fake_block(NULL)
    )
  )

  snap <- snapshot_conditions(board)

  expect_named(snap, c("a", "b"))
  expect_identical(snap$a$message, "boom")
  expect_equal(nrow(snap$b), 0L)
})

test_that("snapshot_conditions excludes message-severity conditions", {

  board <- shiny::reactiveValues(
    blocks = list(
      a = fake_block(
        cond_rv(
          eval = list(
            error = list(), warning = list(),
            message = list(mk_block_cnd("note"))
          )
        )
      )
    )
  )

  expect_equal(nrow(snapshot_conditions(board)$a), 0L)
})

server_args <- function(...) {
  list(
    board = reactiveValues(board = blockr.core::new_board(), ...),
    update = reactiveVal()
  )
}

test_that("a rejected board update is reported back to the model", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      awaiting_outcome(TRUE)
      board$last_update <- list(
        seq = 1L, ok = FALSE, phase = "validate", message = "cycle detected"
      )
      session$flushReact()

      fb <- last_auto_react()

      expect_false(is.null(fb))
      expect_match(fb$msg, "rejected during the validate phase", fixed = TRUE)
      expect_match(fb$msg, "cycle detected", fixed = TRUE)
      expect_identical(react_count(), 1L)
    },
    args = server_args(last_update = NULL),
    session = with_llm_session()
  )
})

test_that("a board update the model did not trigger is ignored", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      board$last_update <- list(
        seq = 1L, ok = FALSE, phase = "validate", message = "cycle detected"
      )
      session$flushReact()

      expect_null(last_auto_react())
    },
    args = server_args(last_update = NULL),
    session = with_llm_session()
  )
})

test_that("a block broken by the applied change is reported after settling", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      awaiting_outcome(TRUE)
      board$last_update <- list(
        seq = 2L, ok = TRUE, phase = "apply", message = NA_character_
      )
      session$flushReact()
      session$elapse(settle_ms + 50)
      session$flushReact()

      fb <- last_auto_react()

      expect_false(is.null(fb))
      expect_match(fb$msg, "now report problems", fixed = TRUE)
      expect_match(fb$msg, "boom", fixed = TRUE)
    },
    args = server_args(
      last_update = NULL,
      blocks = list(a = fake_block(cond_rv(eval = eval_error("boom")$eval)))
    ),
    session = with_llm_session()
  )
})

test_that("a clean apply triggers no auto-reaction", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      awaiting_outcome(TRUE)
      board$last_update <- list(
        seq = 2L, ok = TRUE, phase = "apply", message = NA_character_
      )
      session$flushReact()
      session$elapse(settle_ms + 50)
      session$flushReact()

      expect_null(last_auto_react())
    },
    args = server_args(
      last_update = NULL,
      blocks = list(
        a = fake_block(
          cond_rv(
            eval = list(error = list(), warning = list(), message = list())
          )
        )
      )
    ),
    session = with_llm_session()
  )
})

test_that("auto-reactions are bounded per user turn", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      react_count(2L)
      awaiting_outcome(TRUE)
      board$last_update <- list(
        seq = 3L, ok = FALSE, phase = "apply", message = "boom"
      )
      session$flushReact()

      expect_null(last_auto_react())
    },
    args = server_args(last_update = NULL),
    session = with_llm_session()
  )
})

test_that("identical feedback in a later turn still re-triggers injection", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      awaiting_outcome(TRUE)
      board$last_update <- list(
        seq = 1L, ok = FALSE, phase = "apply", message = "boom"
      )
      session$flushReact()
      first <- last_auto_react()

      react_count(0L)
      awaiting_outcome(TRUE)
      board$last_update <- list(
        seq = 2L, ok = FALSE, phase = "apply", message = "boom"
      )
      session$flushReact()
      second <- last_auto_react()

      expect_identical(first$msg, second$msg)
      expect_false(identical(first$n, second$n))
    },
    args = server_args(last_update = NULL),
    session = with_llm_session()
  )
})
