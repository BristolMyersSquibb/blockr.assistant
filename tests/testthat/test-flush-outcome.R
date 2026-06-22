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

test_that("touched_blocks collects added and modified block ids", {

  brd <- new_board(blocks = c(a = new_dataset_block(), b = new_head_block()))

  upd <- list(
    blocks = list(
      add = list(c = new_head_block()),
      mod = list(b = list(block_name = "X"))
    )
  )

  expect_setequal(touched_blocks(upd, brd), c("c", "b"))
})

test_that("touched_blocks resolves a removed link to its destination", {

  brd <- new_board(
    blocks = c(a = new_dataset_block(), b = new_head_block()),
    links = c(new_link("a", "b", "data"))
  )

  lid <- names(board_links(brd))[[1L]]

  expect_identical(touched_blocks(list(links = list(rm = lid)), brd), "b")
})

test_that("touched_blocks includes the destination of an added link", {

  brd <- new_board(blocks = c(a = new_dataset_block(), b = new_head_block()))

  upd <- list(links = list(add = links(x = new_link("a", "b", "data"))))

  expect_identical(touched_blocks(upd, brd), "b")
})

test_that("touched_blocks is empty for a NULL or block-free update", {

  brd <- new_board(blocks = c(a = new_dataset_block()))

  expect_identical(touched_blocks(NULL, brd), character())
  expect_identical(
    touched_blocks(list(views = list(active = "v")), brd), character()
  )
})

fake_block <- function(value = NULL, error = NULL) {
  list(
    server = list(
      result = function() {
        if (!is.null(error)) stop(error)
        value
      }
    )
  )
}

test_that("collect_touched_results summarises each touched block", {

  board <- list(
    blocks = list(
      a = fake_block(data.frame(x = 1:3)),
      b = fake_block(data.frame(y = 1:5))
    )
  )

  out <- collect_touched_results(c("a", "b"), board)

  expect_identical(out[[1L]], "Results of the blocks you changed:")
  expect_true(any(grepl("- a:", out, fixed = TRUE)))
  expect_true(any(grepl("- b:", out, fixed = TRUE)))
})

test_that("collect_touched_results notes a block with no result", {

  board <- list(blocks = list(a = fake_block(error = "boom")))

  out <- collect_touched_results("a", board)

  expect_true(any(grepl("no result yet", out, fixed = TRUE)))
})

test_that("collect_touched_results caps the listing and notes the remainder", {

  ids <- paste0("b", seq_len(12L))
  blks <- set_names(
    lapply(ids, function(i) fake_block(data.frame(x = 1L))), ids
  )

  out <- collect_touched_results(ids, list(blocks = blks), cap = 10L)

  expect_identical(sum(grepl("^- b", out)), 10L)
  expect_true(any(grepl("showing 10 of 12", out, fixed = TRUE)))
})

test_that("collect_touched_results drops ids absent from the board", {

  board <- list(blocks = list(a = fake_block(1L)))

  expect_null(collect_touched_results("gone", board))
})

test_that("format_flush_feedback carries touched results and the invitation", {

  msg <- format_flush_feedback(
    list(ok = TRUE),
    cnd_frame(),
    results = c("Results of the blocks you changed:", "- a:\n3 rows")
  )

  expect_match(msg, "Results of the blocks you changed", fixed = TRUE)
  expect_match(msg, "Inspect downstream results", fixed = TRUE)
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
      conds(cnd_frame(cnd_row("a", "error", "boom")))
      board$last_update <- list(
        seq = 2L, ok = TRUE, phase = "apply", message = NA_character_
      )
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

      report$count <- 3L
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

board_with_links_args <- function(brd, conds, blocks = list()) {
  list(
    board = reactiveValues(
      board = brd, last_update = NULL, blocks = blocks, conditions = conds
    ),
    update = reactiveVal()
  )
}

test_that("the update listener captures touched blocks while awaiting", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks = c(a = new_dataset_block(), b = new_head_block()),
    links = c(new_link("a", "b", "data"))
  )

  lid <- names(board_links(brd))[[1L]]

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      report$awaiting <- TRUE
      update(
        list(
          blocks = list(mod = list(a = list(dataset = "iris"))),
          links = list(rm = lid)
        )
      )
      session$flushReact()

      expect_setequal(touched(), c("a", "b"))
    },
    args = board_with_links_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("the update listener ignores updates when not awaiting", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(a = new_dataset_block(), b = new_head_block()))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      update(list(blocks = list(mod = list(a = list(dataset = "iris")))))
      session$flushReact()

      expect_identical(touched(), character())
    },
    args = board_with_links_args(brd, reactiveVal(cnd_frame())),
    session = with_llm_session()
  )
})

test_that("the review survives a touched block that errors on eval", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      touched(c("a"))
      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 2L, ok = TRUE, phase = "apply", message = NA_character_
      )
      session$flushReact()

      fb <- report$feedback

      expect_false(is.null(fb))
      expect_match(fb$msg, "no result yet", fixed = TRUE)
    },
    args = board_with_links_args(
      new_board(),
      reactiveVal(cnd_frame()),
      blocks = list(a = fake_block(error = "kaboom"))
    ),
    session = with_llm_session()
  )
})

test_that("a clean build still fires a review carrying touched results", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      touched(c("a"))
      report$awaiting <- TRUE
      board$last_update <- list(
        seq = 2L, ok = TRUE, phase = "apply", message = NA_character_
      )
      session$flushReact()

      fb <- report$feedback

      expect_false(is.null(fb))
      expect_match(fb$msg, "Results of the blocks you changed", fixed = TRUE)
    },
    args = board_with_links_args(
      new_board(),
      reactiveVal(cnd_frame()),
      blocks = list(a = fake_block(data.frame(x = 1:3)))
    ),
    session = with_llm_session()
  )
})
