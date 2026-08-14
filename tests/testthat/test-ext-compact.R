test_that("chat_compact_tokens validates", {

  expect_identical(validate_compact_tokens(1000L), 1000L)
  expect_identical(validate_compact_tokens(Inf), Inf)

  # `Inf` disables compaction, not `0` -- the value is the size a request may
  # reach, so `0` would read as "always compact". The error says so.
  expect_error(
    validate_compact_tokens(0),
    "switch compaction off",
    class = "invalid_compact_tokens"
  )
  expect_error(validate_compact_tokens(-1), class = "invalid_compact_tokens")
  expect_error(validate_compact_tokens(1.5), class = "invalid_compact_tokens")
  expect_error(validate_compact_tokens(NA), class = "invalid_compact_tokens")
  expect_error(validate_compact_tokens("x"), class = "invalid_compact_tokens")
  expect_error(
    validate_compact_tokens(c(1L, 2L)),
    class = "invalid_compact_tokens"
  )

  # The deployment option now seeds the board option's default rather than
  # being read directly, so a session reads it back through the board.
  withr::local_options(blockr.chat_compact_tokens = 123L)

  expect_equal(
    shiny::isolate(chat_compact_tokens(with_llm_session())), 123
  )
})

test_that("a threshold of Inf survives the board's JSON round trip", {

  # JSON has no infinity: a board saved with compaction off writes `Inf` and
  # reads back the string "Inf", which is what the constructor is handed on
  # restore. Rejecting it would abort inside a board-server observer and take
  # the board down, which is the failure #97 was about -- and `Inf` is the
  # default, so it would be every board.
  expect_identical(validate_compact_tokens("Inf"), Inf)
  expect_identical(
    blockr.core::board_option_value(new_chat_compact_option(value = "Inf")),
    Inf
  )

  # The select also sends its value as character.
  expect_identical(validate_compact_tokens("25000"), 25000)

  # Coercion must not turn the validator into a sink.
  expect_error(
    validate_compact_tokens("abc"), class = "invalid_compact_tokens"
  )
  expect_error(
    validate_compact_tokens(c("1", "2")), class = "invalid_compact_tokens"
  )
})

test_that("compaction is off unless a deployment turns it on", {

  expect_identical(
    blockr.core::board_option_value(new_chat_compact_option()), Inf
  )

  withr::local_options(blockr.chat_compact_tokens = 50000L)

  expect_identical(
    blockr.core::board_option_value(new_chat_compact_option()), 50000
  )
})

test_that("the compaction threshold is a board option", {

  withr::local_options(blockr.chat_compact_tokens = 50000L)

  opt <- new_chat_compact_option()

  expect_true(blockr.core::is_board_option(opt))
  expect_identical(blockr.core::board_option_id(opt), "chat_compact_tokens")

  # The select round-trips through character, so Inf has to survive as a value
  # and not arrive back as NA.
  expect_identical(
    blockr.core::board_option_transform(opt)("Inf"), Inf
  )
  expect_identical(
    blockr.core::board_option_transform(opt)("25000"), 25000
  )

  expect_error(
    new_chat_compact_option(value = 0), class = "invalid_compact_tokens"
  )
})

test_that("the combobox reads k/M notation as well as a bare count", {

  expect_identical(parse_token_count("64k"), 64000)
  expect_identical(parse_token_count("1.5M"), 1.5e6)
  expect_identical(parse_token_count(" 200 K "), 200000)
  expect_identical(parse_token_count("Inf"), Inf)
  expect_identical(parse_token_count("123457"), 123457)
  expect_true(is.na(parse_token_count("banana")))

  # Whatever the control hands back is what gets stored, so the two have to
  # agree on the notation the filter lets through.
  expect_identical(compact_tokens_value("64k"), 64000)
  expect_identical(compact_tokens_value(NA), Inf)
  expect_identical(validate_compact_tokens("64k"), 64000)
  expect_match(as.character(compact_token_opts()$createFilter), "kKmM")
})

test_that("a count typed past the ladder stays selected", {

  choices <- compact_token_choices(123457)

  expect_true("123457" %in% choices)
  expect_true("Inf" %in% choices)
  expect_identical(compact_token_key(123457), "123457")
  expect_identical(compact_token_key(Inf), "Inf")

  # Inf as the default must not produce a second "Never" entry.
  expect_identical(sum(compact_token_choices(Inf) == "Inf"), 1L)

  expect_identical(format_token_count(64000), "64k")
  expect_identical(format_token_count(1e6), "1M")
})

tokened_turn <- function(text, input, output) {

  turn <- ellmer::Turn("assistant", text)
  turn@tokens <- c(input, output, NA)

  turn
}

test_that("context_tokens reads the last accounted assistant turn", {

  expect_true(is.na(context_tokens(list())))
  expect_true(
    is.na(context_tokens(list(ellmer::Turn("user", "hi"))))
  )
  expect_true(
    is.na(context_tokens(list(ellmer::Turn("assistant", "hi"))))
  )

  turns <- list(
    ellmer::Turn("user", "a"),
    tokened_turn("b", 100, 20),
    ellmer::Turn("user", "c"),
    tokened_turn("d", 400, 50)
  )

  expect_identical(context_tokens(turns), 450)

  # A turn the user just sent is not yet accounted for; the bound is read off
  # the last exchange the provider actually priced.
  expect_identical(
    context_tokens(c(turns, list(ellmer::Turn("user", "e")))),
    450
  )
})

test_that("context_tokens counts the cached prefix", {

  # What a warm Anthropic cache looks like: the conversation has migrated into
  # cache_read, leaving `input` holding only the newest turn. Counting input
  # and output alone reads 170 here and never trips a bound, so a long session
  # goes unbounded -- the exact failure this is meant to prevent.
  warm <- ellmer::Turn("assistant", "reply")
  warm@tokens <- c(120, 50, 40000)

  expect_identical(context_tokens(list(warm)), 40170)
  expect_true(over_context_bound(list(warm), 30000))
})

test_that("over_context_bound only fires on a real count", {

  turns <- list(ellmer::Turn("user", "a"), tokened_turn("b", 400, 50))

  expect_true(over_context_bound(turns, 100))
  expect_false(over_context_bound(turns, 450))
  expect_false(over_context_bound(turns, Inf))

  expect_false(
    over_context_bound(list(ellmer::Turn("assistant", "no tokens")), 1)
  )
})

test_that("compaction_split needs two turns to work with", {

  expect_null(compaction_split(list(), 8L))
  expect_null(compaction_split(list(ellmer::Turn("user", "x")), 8L))
})

test_that("compaction_split sheds a short conversation that is over bound", {

  # A single large tool result can exceed a context window in a couple of
  # turns. Honouring `keep` there would decline to compact the one
  # conversation that is about to be rejected -- the bound would be inert
  # exactly where it is needed.
  for (n in c(2L, 4L, 6L, 8L)) {

    turns <- alternating_turns(n)
    res <- compaction_split(turns, 8L)

    expect_false(is.null(res), info = paste("n =", n))
    expect_gte(length(res$summarise), 2L)
    expect_length(res$summarise, n - length(res$keep))
  }
})

test_that("compaction_split opens the kept window on a user turn", {

  turns <- list(
    ellmer::Turn("user", "1"),
    ellmer::Turn("assistant", "2"),
    ellmer::Turn("user", "3"),
    ellmer::Turn("assistant", "4"),
    ellmer::Turn("user", "5"),
    ellmer::Turn("assistant", "6")
  )

  res <- compaction_split(turns, 2L)

  expect_length(res$summarise, 4L)
  expect_length(res$keep, 2L)
  expect_identical(res$keep[[1L]]@role, "user")
})

test_that("compaction_split widens forwards, never backwards", {

  # The cut lands mid-exchange, on the assistant turn at index 5. Widening
  # back would keep more than asked and could stall on a long tool run, so
  # the split moves forward to the next user turn instead.
  turns <- list(
    ellmer::Turn("user", "1"),
    ellmer::Turn("assistant", "2"),
    ellmer::Turn("user", "3"),
    ellmer::Turn("assistant", "4"),
    ellmer::Turn("assistant", "5"),
    ellmer::Turn("user", "6"),
    ellmer::Turn("assistant", "7")
  )

  res <- compaction_split(turns, 3L)

  expect_length(res$summarise, 5L)
  expect_identical(res$keep[[1L]]@role, "user")
  expect_identical(turn_text(res$keep[[1L]]), "6")
})

test_that("compaction_split keeps nothing when no user turn follows", {

  turns <- list(
    ellmer::Turn("user", "1"),
    ellmer::Turn("assistant", "2"),
    ellmer::Turn("assistant", "3"),
    ellmer::Turn("assistant", "4")
  )

  res <- compaction_split(turns, 2L)

  expect_length(res$summarise, 4L)
  expect_length(res$keep, 0L)
})

test_that("compacted_turns alternates roles around the handover", {

  kept <- list(
    ellmer::Turn("user", "later"),
    ellmer::Turn("assistant", "reply")
  )

  res <- compacted_turns("the summary", kept)

  expect_length(res, 4L)
  expect_identical(
    chr_ply(res, function(x) x@role),
    c("user", "assistant", "user", "assistant")
  )
  expect_identical(turn_text(res[[2L]]), "the summary")

  # Nothing kept is still a valid conversation to carry on from.
  expect_length(compacted_turns("only summary", list()), 2L)
})

test_that("compaction_client leaves the live client armed and intact", {

  live <- fake_chat_function()

  live$register_tool(
    ellmer::tool(function() "ok", name = "ping", description = "ping")
  )
  live$set_system_prompt("the board prompt")
  live$set_turns(alternating_turns(4L))

  scratch <- compaction_client(live, alternating_turns(2L))

  expect_length(scratch$get_tools(), 0L)
  expect_length(scratch$get_turns(), 2L)
  expect_identical(scratch$get_system_prompt(), compaction_system_prompt())

  expect_length(live$get_tools(), 1L)
  expect_length(live$get_turns(), 4L)
  expect_identical(live$get_system_prompt(), "the board prompt")
})

test_that("keep is a whole number of turns, and not where you switch off", {

  expect_identical(validate_compact_keep(0), 0L)
  expect_identical(validate_compact_keep(8L), 8L)
  expect_identical(validate_compact_keep("8"), 8L)

  # `Inf` here would mean "summarise as little as possible", not "off" --
  # compaction is switched off through the threshold instead.
  expect_error(validate_compact_keep(Inf), class = "invalid_compact_keep")
  expect_error(validate_compact_keep(-1), class = "invalid_compact_keep")
  expect_error(validate_compact_keep(2.5), class = "invalid_compact_keep")
})

test_that("keep is a board option on a doubling ladder", {

  opt <- new_chat_keep_option()

  expect_true(blockr.core::is_board_option(opt))
  expect_identical(blockr.core::board_option_id(opt), "chat_compact_keep")
  expect_identical(blockr.core::board_option_value(opt), 8L)
  expect_identical(
    compact_keep_choices(8L),
    c("0", "2", "4", "8", "16", "32", "64", "128", "256")
  )

  # The slider hands its rung back as text.
  expect_identical(blockr.core::board_option_transform(opt)("128"), 128L)

  # Reading it cannot abort: it happens inside an observer.
  expect_identical(blockr.core::board_option_transform(opt)(""), 8L)
})

test_that("an off-ladder keep value still renders", {

  # `sliderTextInput()` errors outright when `selected` is not among
  # `choices`, and that render is the board settings panel. Nothing stops a
  # deployment setting 20, or a board carrying it, so the value in force has
  # to be folded into the rungs.
  withr::local_options(blockr.chat_compact_keep = 20L)

  opt <- new_chat_keep_option()

  expect_identical(blockr.core::board_option_value(opt), 20L)
  expect_true("20" %in% compact_keep_choices(20L))
  expect_silent(blockr.core::board_option_ui(opt)("opt"))

  html <- as.character(blockr.core::board_option_ui(opt)("opt"))

  expect_match(html, "sw-slider-text", fixed = TRUE)
  expect_match(html, "chat_compact_keep", fixed = TRUE)
})
