tool_request_turn <- function(id = "c1") {
  ellmer::Turn(
    "assistant",
    list(
      ellmer::ContentToolRequest(
        id = id,
        name = "add_block",
        arguments = list(type = "dataset")
      )
    )
  )
}

tool_result_turn <- function(id = "c1") {
  ellmer::Turn(
    "user",
    list(
      ellmer::ContentToolResult(
        request = ellmer::ContentToolRequest(
          id = id,
          name = "add_block",
          arguments = list(type = "dataset")
        ),
        value = "added block dataset_1"
      )
    )
  )
}

test_that("a serialized conversation replays as the turns it came from", {

  turns <- list(
    ellmer::Turn("user", "add a block"),
    tool_request_turn(),
    tool_result_turn(),
    ellmer::Turn("assistant", "Added a dataset block.")
  )

  recs <- deserialize_chat_history(serialize_chat_history(turns, Inf))

  expect_length(recs, 4L)

  back <- lapply(recs, ellmer::contents_replay)

  expect_identical(
    lapply(back, ellmer::contents_text),
    lapply(turns, ellmer::contents_text)
  )
  expect_s3_class(back[[2]]@contents[[1]], "ellmer::ContentToolRequest")
  expect_s3_class(back[[3]]@contents[[1]], "ellmer::ContentToolResult")
})

test_that("the raw provider response is not saved", {

  turn <- ellmer::Turn("assistant", "hi")
  turn@json <- list(id = "msg_1", content = strrep("x", 5000))

  recs <- deserialize_chat_history(
    serialize_chat_history(list(turn), Inf)
  )

  expect_length(recs[[1]]$props$json, 0L)
})

test_that("nothing is saved without turns or budget", {

  turns <- list(ellmer::Turn("user", "hi"))

  expect_null(serialize_chat_history(turns, 0L))
  expect_null(serialize_chat_history(list(), Inf))
})

test_that("save_turns keeps the most recent turns", {

  turns <- lapply(
    sprintf("message number %d", 1:8),
    function(txt) ellmer::Turn("user", txt)
  )

  expect_length(
    deserialize_chat_history(serialize_chat_history(turns, Inf)),
    8L
  )

  kept <- lapply(
    deserialize_chat_history(serialize_chat_history(turns, 3L)),
    ellmer::contents_replay
  )

  expect_length(kept, 3L)
  expect_identical(
    lapply(kept, ellmer::contents_text),
    list("message number 6", "message number 7", "message number 8")
  )
})

test_that("truncation never opens on a tool result", {

  turns <- list(
    ellmer::Turn("user", "add a block"),
    tool_request_turn(),
    tool_result_turn(),
    ellmer::Turn("assistant", "Added a dataset block.")
  )

  # Keeping the last two opens the window on the tool result, stranding it
  # from its request; the whole exchange has to go with it.
  kept <- deserialize_chat_history(serialize_chat_history(turns, 2L))

  expect_length(kept, 1L)
  expect_identical(
    ellmer::contents_text(ellmer::contents_replay(kept[[1]])),
    "Added a dataset block."
  )
})

test_that("truncation never closes on a tool request", {

  turns <- list(ellmer::Turn("user", "add a block"), tool_request_turn())

  kept <- deserialize_chat_history(
    serialize_chat_history(turns, Inf)
  )

  expect_length(kept, 1L)
  expect_identical(
    ellmer::contents_text(ellmer::contents_replay(kept[[1]])),
    "add a block"
  )
})

test_that("an unreadable blob restores as no conversation", {

  expect_null(deserialize_chat_history("not json at all"))
  expect_null(deserialize_chat_history(NULL))
  expect_null(deserialize_chat_history(character()))
})

test_that("save_turns accepts 0, a positive whole number and Inf", {

  expect_identical(validate_save_turns(0L), 0L)
  expect_identical(validate_save_turns(50L), 50L)
  expect_identical(validate_save_turns(Inf), Inf)

  for (bad in list(-1L, 2.5, NA_integer_, "50", NULL, c(1L, 2L))) {
    expect_error(validate_save_turns(bad), class = "invalid_save_turns")
  }
})
