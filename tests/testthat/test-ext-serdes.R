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

round_trip <- function(store, save_turns = Inf) {
  deserialize_chat_history(serialize_chat_threads(store, save_turns))
}

test_that("a serialized thread replays as the turns it came from", {

  turns <- list(
    ellmer::Turn("user", "add a block"),
    tool_request_turn(),
    tool_result_turn(),
    ellmer::Turn("assistant", "Added a dataset block.")
  )

  back <- round_trip(new_thread_store(list(c_1 = fake_thread(turns))))

  expect_length(back, 1L)
  expect_true(is_thread_set(back))

  replayed <- lapply(thread_turns(back[["c_1"]]), ellmer::contents_replay)

  expect_identical(
    lapply(replayed, ellmer::contents_text),
    lapply(turns, ellmer::contents_text)
  )
  expect_s3_class(replayed[[2]]@contents[[1]], "ellmer::ContentToolRequest")
  expect_s3_class(replayed[[3]]@contents[[1]], "ellmer::ContentToolResult")
})

test_that("every thread in the store is saved", {

  store <- new_thread_store(
    list(
      c_1 = fake_thread(list(ellmer::Turn("user", "one")), "c_1"),
      c_2 = fake_thread(list(ellmer::Turn("user", "two")), "c_2")
    )
  )

  back <- round_trip(store)

  expect_named(back, c("c_1", "c_2"))
  expect_identical(
    chr_ply(back, function(rec) rec[["title"]]),
    c("Thread c_1", "Thread c_2")
  )
})

test_that("the raw provider response is not saved", {

  turn <- ellmer::Turn("assistant", "hi")
  turn@json <- list(id = "msg_1", content = strrep("x", 5000))

  back <- round_trip(new_thread_store(list(c_1 = fake_thread(list(turn)))))

  expect_length(
    back[["c_1"]][["nodes"]][["n_0001"]][["turns"]][[1]]$props$json,
    0L
  )
})

test_that("nothing is saved without threads or budget", {

  store <- new_thread_store(
    list(c_1 = fake_thread(list(ellmer::Turn("user", "hi"))))
  )

  expect_null(serialize_chat_threads(store, 0L))
  expect_null(serialize_chat_threads(new_thread_store(), Inf))
})

test_that("save_turns keeps the most recent turns of each thread", {

  turns <- unlst(
    lapply(
      1:4,
      function(i) {
        list(
          ellmer::Turn("user", sprintf("question %d", i)),
          ellmer::Turn("assistant", sprintf("answer %d", i))
        )
      }
    ),
    recursive = FALSE
  )

  whole <- round_trip(new_thread_store(list(c_1 = fake_thread(turns))))

  expect_length(thread_turns(whole[["c_1"]]), 8L)

  kept <- thread_turns(
    round_trip(new_thread_store(list(c_1 = fake_thread(turns))), 4L)[["c_1"]]
  )

  expect_identical(
    lapply(lapply(kept, ellmer::contents_replay), ellmer::contents_text),
    list("question 3", "answer 3", "question 4", "answer 4")
  )
})

test_that("the focus and the meter ride with the thread they belong to", {

  turns <- unlst(
    lapply(
      1:4,
      function(i) {
        list(
          ellmer::Turn("user", sprintf("question %d", i)),
          ellmer::Turn("assistant", sprintf("answer %d", i))
        )
      }
    ),
    recursive = FALSE
  )

  vals <- list(focus = list("data", "filt"), spent = list(1200L, 88L))

  store <- new_thread_store(list(c_1 = fake_thread(turns, values = vals)))

  expect_identical(round_trip(store)[["c_1"]][["values"]], vals)

  # Trimming rewrites the nodes, which is where the budget bites; what the
  # conversation was pointed at and what it cost are not turns and survive a
  # cut that drops most of them.
  trimmed <- round_trip(store, 4L)[["c_1"]]

  expect_length(thread_turns(trimmed), 4L)
  expect_identical(trimmed[["values"]], vals)
})

test_that("a trimmed thread never opens on a reply", {

  turns <- list(
    ellmer::Turn("user", "add a block"),
    tool_request_turn(),
    tool_result_turn(),
    ellmer::Turn("assistant", "Added a dataset block.")
  )

  # A budget of 2 would cut between the request and its result; the whole
  # exchange goes rather than stranding the result from its request.
  kept <- round_trip(new_thread_store(list(c_1 = fake_thread(turns))), 2L)

  expect_null(kept)
})

test_that("a trimmed thread re-roots on the node it now starts at", {

  turns <- list(
    ellmer::Turn("user", "one"),
    ellmer::Turn("assistant", "first"),
    ellmer::Turn("user", "two"),
    ellmer::Turn("assistant", "second")
  )

  trimmed <- round_trip(new_thread_store(list(c_1 = fake_thread(turns))), 2L)
  kept <- trimmed[["c_1"]]

  expect_length(kept[["nodes"]], 2L)
  expect_null(kept[["nodes"]][[1L]][["parent"]])
  expect_identical(kept[["current_leaf"]], names(kept[["nodes"]])[2L])
  expect_identical(
    unlst(kept[["nodes"]][[1L]][["children"]]),
    names(kept[["nodes"]])[2L]
  )
})

test_that("an unreadable blob restores as no conversation", {

  expect_null(deserialize_chat_history("not json at all"))
  expect_null(deserialize_chat_history(NULL))
  expect_null(deserialize_chat_history(character()))
})

deser_with_history <- function(blob) {

  ser <- blockr.core::blockr_ser(
    new_assistant_extension(),
    data = list(history = blob)
  )

  blockr.core::blockr_deser(
    jsonlite::fromJSON(
      jsonlite::toJSON(ser, auto_unbox = TRUE, null = "null"),
      simplifyDataFrame = FALSE,
      simplifyMatrix = FALSE
    )
  )
}

seeds <- function(blob) {
  environment(blockr.dock::extension_server(deser_with_history(blob)))
}

test_that("a thread blob seeds the store and a legacy one seeds the client", {

  from_threads <- seeds(
    jsonlite::serializeJSON(
      list(c_1 = fake_thread(list(ellmer::Turn("user", "hi"))))
    )
  )

  expect_named(from_threads$threads, "c_1")
  expect_null(from_threads$messages)

  from_legacy <- seeds(
    jsonlite::serializeJSON(
      lapply(list(ellmer::Turn("user", "hi")), ellmer::contents_record)
    )
  )

  expect_length(from_legacy$messages, 1L)
  expect_null(from_legacy$threads)
})

test_that("threads and recorded turns are told apart", {

  expect_true(
    is_thread_set(list(c_1 = fake_thread(list(ellmer::Turn("user", "hi")))))
  )
  expect_false(
    is_thread_set(
      lapply(list(ellmer::Turn("user", "hi")), ellmer::contents_record)
    )
  )
  expect_false(is_thread_set(list()))
  expect_false(is_thread_set(NULL))
})

test_that("chat_save_turns accepts 0, a positive whole number and Inf", {

  expect_identical(validate_save_turns(0L), 0L)
  expect_identical(validate_save_turns(50L), 50L)
  expect_identical(validate_save_turns(Inf), Inf)

  for (bad in list(-1L, 2.5, NA_integer_, "50", NULL, c(1L, 2L))) {
    expect_error(validate_save_turns(bad), class = "invalid_save_turns")
  }
})

test_that("chat_save_turns reads the option, defaulting to 50", {

  expect_identical(chat_save_turns(), 50L)

  withr::local_options(blockr.chat_save_turns = 0L)
  expect_identical(chat_save_turns(), 0L)

  withr::local_options(blockr.chat_save_turns = "nope")
  expect_error(chat_save_turns(), class = "invalid_save_turns")
})

test_that("the store lists threads newest first", {

  store <- new_thread_store(
    list(
      c_old = fake_thread(
        list(ellmer::Turn("user", "old")), "c_old", "2026-08-01T10:00:00Z"
      ),
      c_new = fake_thread(
        list(ellmer::Turn("user", "new")), "c_new", "2026-08-27T10:00:00Z"
      )
    )
  )

  listed <- store$list(NULL)

  expect_identical(chr_xtr(listed, "id"), c("c_new", "c_old"))

  # The client maps over `conversations`, so this has to cross the wire as a
  # JSON array; a named list would arrive as an object and read as empty.
  expect_null(names(listed))
  expect_match(
    as.character(jsonlite::toJSON(listed, auto_unbox = TRUE)),
    "^\\["
  )

  store$delete(NULL, "c_new")

  expect_identical(chr_xtr(store$list(NULL), "id"), "c_old")
  expect_null(store$get(NULL, "c_new"))
})
