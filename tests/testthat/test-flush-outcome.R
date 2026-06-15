test_that("added_conditions returns rows absent from the baseline", {

  fresh <- added_conditions(
    cnd_frame(),
    cnd_frame(cnd_row("a", "error", "boom"))
  )

  expect_equal(nrow(fresh), 1L)
  expect_identical(fresh$message, "boom")
})

test_that("added_conditions ignores a pre-existing condition", {

  df <- cnd_frame(cnd_row("a", "error", "boom"))

  expect_equal(nrow(added_conditions(df, df)), 0L)
})

test_that("added_conditions keys on (block, id), not id alone", {

  base <- cnd_frame(cnd_row("a", "error", "boom"))
  cur <- cnd_frame(cnd_row("a", "error", "boom"), cnd_row("b", "error", "boom"))

  fresh <- added_conditions(base, cur)

  expect_identical(fresh$block, "b")
})

test_that("added_conditions reports nothing for a condition that cleared", {

  base <- cnd_frame(cnd_row("a", "error", "boom"))

  expect_equal(nrow(added_conditions(base, cnd_frame())), 0L)
})

test_that("format_flush_feedback reports a rejected board update", {

  msg <- format_flush_feedback(
    list(ok = FALSE, phase = "validate", message = "cycle detected")
  )

  expect_match(msg, "rejected during the validate phase", fixed = TRUE)
  expect_match(msg, "cycle detected", fixed = TRUE)
})

test_that("format_flush_feedback reports an apply-phase failure", {

  msg <- format_flush_feedback(
    list(ok = FALSE, phase = "apply", message = "boom")
  )

  expect_match(msg, "apply phase", fixed = TRUE)
})

test_that("format_flush_feedback reports newly broken blocks per block", {

  msg <- format_flush_feedback(
    list(ok = TRUE, phase = "apply", message = NA_character_),
    cnd_frame(cnd_row("a", "error", "object 'x' not found"))
  )

  expect_match(msg, "some blocks now report problems", fixed = TRUE)
  expect_match(msg, "object 'x' not found", fixed = TRUE)
  expect_match(msg, "Block a conditions", fixed = TRUE)
})

test_that("format_flush_feedback is NULL for a clean apply", {

  expect_null(
    format_flush_feedback(
      list(ok = TRUE, phase = "apply", message = NA_character_),
      cnd_frame()
    )
  )
})

test_that("format_flush_feedback combines a rejection and new conditions", {

  msg <- format_flush_feedback(
    list(ok = FALSE, phase = "apply", message = "partial"),
    cnd_frame(cnd_row("a", "error", "boom"))
  )

  expect_match(msg, "rejected", fixed = TRUE)
  expect_match(msg, "boom", fixed = TRUE)
})

server_args <- function(conds, ...) {
  list(
    board = reactiveValues(
      board = blockr.core::new_board(),
      last_update = NULL,
      blocks = list(),
      conditions = conds,
      ...
    ),
    update = reactiveVal()
  )
}

test_that("a rejected board update is reported back to the model", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 1L, ok = FALSE, phase = "validate", message = "cycle detected"
      )
      session$flushReact()

      fb <- report$feedback

      expect_false(is.null(fb))
      expect_match(fb$msg, "rejected during the validate phase", fixed = TRUE)
      expect_match(fb$msg, "cycle detected", fixed = TRUE)
      expect_identical(report$count, 1L)
    },
    args = server_args(reactiveVal(cnd_frame())),
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

      expect_null(report$feedback)
    },
    args = server_args(reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("a block broken by the applied change is reported after settling", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  conds <- reactiveVal(cnd_frame())

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 2L, ok = TRUE, phase = "apply", message = NA_character_
      )
      session$flushReact()

      conds(cnd_frame(cnd_row("a", "error", "boom")))
      session$flushReact()
      session$elapse(settle_ms + 50)
      session$flushReact()

      fb <- report$feedback

      expect_false(is.null(fb))
      expect_match(fb$msg, "now report problems", fixed = TRUE)
      expect_match(fb$msg, "boom", fixed = TRUE)
    },
    args = server_args(conds),
    session = with_llm_session()
  )
})

test_that("a clean apply triggers no auto-reaction", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 2L, ok = TRUE, phase = "apply", message = NA_character_
      )
      session$flushReact()
      session$elapse(settle_ms + 50)
      session$flushReact()

      expect_null(report$feedback)
    },
    args = server_args(reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("auto-reactions are bounded per user turn", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      report$count <- 2L
      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 3L, ok = FALSE, phase = "apply", message = "boom"
      )
      session$flushReact()

      expect_null(report$feedback)
    },
    args = server_args(reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("identical feedback in a later turn still re-triggers injection", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 1L, ok = FALSE, phase = "apply", message = "boom"
      )
      session$flushReact()
      first <- report$feedback

      report$count <- 0L
      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 2L, ok = FALSE, phase = "apply", message = "boom"
      )
      session$flushReact()
      second <- report$feedback

      expect_identical(first$msg, second$msg)
      expect_false(identical(first$n, second$n))
    },
    args = server_args(reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})
