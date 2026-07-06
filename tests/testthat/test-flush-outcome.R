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

  expect_match(out[[1L]], "Results of the blocks you changed", fixed = TRUE)
  expect_true(any(grepl("- a:", out, fixed = TRUE)))
  expect_true(any(grepl("- b:", out, fixed = TRUE)))
})

test_that("collect_touched_results notes a block with no result", {

  board <- list(blocks = list(a = fake_block(error = "boom")))

  out <- collect_touched_results("a", board)

  expect_true(any(grepl("no result:", out, fixed = TRUE)))
})

board_with_links <- function(brd, blocks) {
  list(board = brd, blocks = blocks)
}

test_that("neighbor_blocks returns the blocks feeding and fed by the ids", {

  brd <- new_board(
    blocks = c(
      a = new_dataset_block("iris"),
      b = new_dataset_block("mtcars"),
      m = new_merge_block(),
      c = new_head_block()
    ),
    links = c(
      new_link("a", "m", "x"),
      new_link("b", "m", "y"),
      new_link("m", "c", "data")
    )
  )

  expect_setequal(neighbor_blocks("m", list(board = brd)), c("a", "b", "c"))
  expect_identical(neighbor_blocks("a", list(board = brd)), "m")
  expect_identical(neighbor_blocks("m", list()), character())
})

test_that("collect_touched_results pulls in a touched block's neighbours", {

  brd <- new_board(
    blocks = c(
      up = new_dataset_block("iris"),
      mid = new_head_block(),
      sink = new_head_block()
    ),
    links = c(new_link("up", "mid", "data"), new_link("mid", "sink", "data"))
  )

  board <- board_with_links(
    brd,
    list(
      up = fake_block(data.frame(VISITNUM = 1L, AVISITN = 2L, TRTP = "A")),
      mid = fake_block(error = "object 'VISITN' not found"),
      sink = fake_block(data.frame(z = 1))
    )
  )

  out <- collect_touched_results("mid", board)

  expect_true(any(grepl("- mid:", out, fixed = TRUE)))
  expect_true(any(grepl("no result:", out, fixed = TRUE)))
  expect_true(any(grepl("- up:", out, fixed = TRUE)))
  expect_true(any(grepl("VISITNUM", out, fixed = TRUE)))
  expect_true(any(grepl("- sink:", out, fixed = TRUE)))
})

test_that("collect_touched_results summarises a non-data-frame input", {

  brd <- new_board(
    blocks = c(up = new_dataset_block("mtcars"), down = new_head_block()),
    links = c(new_link("up", "down", "data"))
  )

  board <- board_with_links(
    brd,
    list(
      up = fake_block(lm(mpg ~ wt, mtcars)),
      down = fake_block(error = "non-numeric argument")
    )
  )

  out <- collect_touched_results("down", board)

  expect_true(any(grepl("- up:", out, fixed = TRUE)))
  expect_true(any(grepl("Coefficients", out, fixed = TRUE)))
})

test_that("a touched block's neighbours fall under the same cap", {

  brd <- new_board(
    blocks = c(up = new_dataset_block("iris"), down = new_head_block()),
    links = c(new_link("up", "down", "data"))
  )

  board <- board_with_links(
    brd,
    list(
      up = fake_block(data.frame(a = 1)),
      down = fake_block(data.frame(b = 1))
    )
  )

  out <- collect_touched_results("down", board, cap = 1L)

  expect_identical(sum(grepl("^- ", out)), 1L)
  expect_true(any(grepl("- down:", out, fixed = TRUE)))
  expect_true(any(grepl("showing 1 of 2", out, fixed = TRUE)))
})

test_that("the block cap is option-driven, defaulting to 50", {

  expect_identical(review_max_blocks(), 50L)

  board <- list(
    blocks = list(
      a = fake_block(data.frame(x = 1)),
      b = fake_block(data.frame(y = 1))
    )
  )

  withr::local_options(blockr.assistant_review_max_blocks = 1L)
  out <- collect_touched_results(c("a", "b"), board)

  expect_true(any(grepl("showing 1 of 2", out, fixed = TRUE)))
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

test_that("a second consecutive failure re-injects with surrender guidance", {

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

      # both rounds inject (distinct n); the repeat escalates: same rejection
      # text plus the change-strategy/escalate guidance with the verbatim error
      expect_false(identical(first$n, second$n))
      expect_true(startsWith(second$msg, first$msg))
      expect_match(second$msg, "Strategy note", fixed = TRUE)
      expect_match(second$msg, "Verbatim error: boom", fixed = TRUE)
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
      expect_match(fb$msg, "no result:", fixed = TRUE)
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

test_that("promises_action flags future commitments, not questions/answers", {

  expect_true(promises_action("Next step, I'll add the summarize block."))
  expect_true(promises_action("I will now add blocks to compute the change."))
  expect_true(promises_action("Let me add a dm_pull block first."))
  # verbatim from a live run that slipped past the first verb list
  expect_true(promises_action(
    "To fix this I need to correct adaschg_traj so it genuinely summarizes."
  ))
  expect_true(promises_action(
    "I will adjust the summarize configuration so the output contains TRTP."
  ))

  expect_false(promises_action("Which endpoint do you care about?"))
  expect_false(promises_action("The board has 3 blocks: a, b, c."))
  expect_false(promises_action("I added the chart and wired it to adsl."))
  expect_false(promises_action(""))
  expect_false(promises_action(NULL))
})

test_that("effect_is_noop matches only the explicit sentinels", {

  expect_true(effect_is_noop("no rows or columns changed"))
  expect_true(effect_is_noop("table populated but DEGENERATE"))
  expect_true(effect_is_noop("cells not populated"))

  expect_false(effect_is_noop(""))
  expect_false(effect_is_noop("rows: 254 -> 254 (UNCHANGED); cols: +CHG"))
})

test_that("format_flush_feedback surfaces no-op blocks from the results attr", {

  results <- structure(
    c("Results of the blocks you changed and the blocks linked to them:",
      "- f:\nsome summary"),
    noop_ids = "f"
  )

  fb <- format_flush_feedback(list(ok = TRUE), NULL, results)

  expect_match(fb, "left their data unchanged", fixed = TRUE)
  expect_match(fb, "f", fixed = TRUE)
})
