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

fake_block <- function(value = NULL, error = NULL, state = NULL) {
  list(
    server = list(
      result = function() {
        if (!is.null(error)) stop(error)
        value
      },
      state = state
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

  expect_true(
    any(grepl("has not evaluated successfully: boom", out, fixed = TRUE))
  )
})

test_that("collect_touched_results reports a stale block as stale", {

  board <- list(
    blocks = list(a = fake_block(error = "")),
    eval   = list(a = function() "stale")
  )

  out <- collect_touched_results("a", board)

  expect_true(any(grepl("(`stale`)", out, fixed = TRUE)))
  expect_true(any(grepl("out of date", out, fixed = TRUE)))
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
  expect_true(any(grepl("object 'VISITN' not found", out, fixed = TRUE)))
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

test_that("a board update the model did not trigger is ignored", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      board$last_update <- list(
        seq = 1L, ok = FALSE, phase = "validate", message = "cycle detected"
      )
      session$flushReact()

      expect_null(report$nudge)
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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

test_that("changed_blocks names the blocks added or modified", {

  upd <- list(
    blocks = list(add = list(a = "block"), mod = list(b = list(n = 5L)))
  )

  expect_identical(changed_blocks(upd), c("a", "b"))
  expect_identical(changed_blocks(NULL), character())
})

test_that("collect_touched_results carries state for the changed blocks", {

  board <- list(
    blocks = list(
      a = fake_block(data.frame(x = 1:3), state = list(n = function() 3L)),
      b = fake_block(data.frame(y = 1:5), state = list(n = function() 5L))
    )
  )

  out <- collect_touched_results(c("a", "b"), board, changed = "a")

  expect_true(any(grepl("Applied state:", out, fixed = TRUE)))
  expect_true(any(grepl("int 3", out, fixed = TRUE)))
  expect_false(any(grepl("int 5", out, fixed = TRUE)))
})

test_that("collect_touched_results reports no state without a changed set", {

  board <- list(
    blocks = list(a = fake_block(data.frame(x = 1:3), state = list(n = 3L)))
  )

  out <- collect_touched_results("a", board)

  expect_false(any(grepl("Applied state:", out, fixed = TRUE)))
})

test_that("collect_touched_results omits state for an unconstructed block", {

  board <- list(blocks = list(a = fake_block(data.frame(x = 1:3))))

  out <- collect_touched_results("a", board, changed = "a")

  expect_true(any(grepl("- a:", out, fixed = TRUE)))
  expect_false(any(grepl("Applied state:", out, fixed = TRUE)))
})

test_that("collect_touched_results reports state for a block with no result", {

  board <- list(
    blocks = list(a = fake_block(error = "", state = list(n = function() 3L))),
    eval   = list(a = function() "dormant")
  )

  out <- collect_touched_results("a", board, changed = "a")

  expect_true(any(grepl("Applied state:", out, fixed = TRUE)))
  expect_true(any(grepl("int 3", out, fixed = TRUE)))
  expect_true(any(grepl("no result to read", out, fixed = TRUE)))
})

test_that("collect_touched_results omits a state value str() would cut", {

  long  <- strrep("z", 300L)
  board <- list(
    blocks = list(
      a = fake_block(
        data.frame(x = 1:3), state = list(script = function() long)
      )
    )
  )

  out <- paste(
    collect_touched_results("a", board, changed = "a"), collapse = "\n"
  )

  expect_match(out, "Applied state:", fixed = TRUE)
  expect_match(out, "300 chars omitted", fixed = TRUE)
  expect_match(out, "get_block_state", fixed = TRUE)
  expect_no_match(out, "zzz", fixed = TRUE)
})
