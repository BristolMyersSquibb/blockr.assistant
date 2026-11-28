# End-to-end tests of the assistant, through shinytest2.
# Each test starts an example app of `inst/examples`, whose page in Chrome
# holds the assistant's chat.
# The app's deployment sends the assistant's calls to the mock of OpenAI's
# Responses API, on another origin (helper-mock-api.R).
# Each test gives the mock the replies to its turns, and sends a message in the
# chat as a user does.
# It then reads the board and the statuses that the page gives through
# `blockrTest`, the results that R exports, and the calls that reached the
# mock.

# The edit that adds the block `top`, which shows the first three rows of the
# block `filt`, and links `filt` to it.
add_top <- list(
  commands = list(
    list(
      command = list(package = "blockr.core", id = "add_block"),
      args = list(
        registry_id = list(package = "blockr.core", id = "head_block"),
        id = "top",
        state = list(n = 3L)
      )
    ),
    list(
      command = list(package = "blockr.core", id = "add_link"),
      args = list(from = "filt", to = "top", input = "data")
    )
  )
)

test_that("a turn reads the board, and its reply enters the conversation", {

  mock <- local_mock_api(
    mock_reply(mock_tool_call("list_blocks")),
    mock_reply(mock_text("The board holds four blocks."))
  )

  app <- local_example_app("populated-board", mock_deployment(mock))

  send_message(app, "What is on the board?")
  conversation <- wait_for_reply(app, "The board holds four blocks.")

  # The model called list_blocks, and the page sent the tool's result with the
  # next call.
  # The result lists the blocks of the board that the client holds.
  calls <- turn_calls(mock)
  expect_length(calls, 2L)

  outputs <- tool_outputs(calls[[2L]])
  expect_length(outputs, 1L)

  listed <- jsonlite::fromJSON(outputs[[1L]], simplifyVector = FALSE)
  blocks <- app_board(app)[["blocks"]]

  expect_identical(chr_xtr(listed, "id"), names(blocks))
  expect_identical(
    lst_xtr(listed, "registry_id"),
    unname(lst_xtr(blocks, "registry_id"))
  )

  # The conversation holds the user's message, the model's call of the tool,
  # the tool's result and the reply, which the chat shows below the call.
  expect_identical(
    message_roles(conversation),
    c("user", "assistant", "tool", "assistant")
  )
  expect_identical(
    message_text(conversation[["messages"]][[1L]]),
    "What is on the board?"
  )
  expect_identical(
    conversation[["messages"]][[2L]][["parts"]][[1L]][["tool"]],
    "list_blocks"
  )
  expect_match(
    chat_text(app),
    "List blocks\\s+The board holds four blocks[.]"
  )
})

test_that("an edit adds a block and links it, and returns its review", {

  mock <- local_mock_api(
    mock_reply(mock_tool_call("edit", add_top)),
    mock_reply(mock_text("I added the block top."))
  )

  app <- local_example_app("populated-board", mock_deployment(mock))

  send_message(app, "Show the first three rows of the filtered data.")
  wait_for_reply(app, "I added the block top.")

  # The client holds the block and its link, and the block reads ready.
  board <- app_board(app)

  expect_identical(
    board[["blocks"]][["top"]][["registry_id"]],
    list(package = "blockr.core", id = "head_block")
  )

  links <- Filter(
    function(link) identical(link[["to"]], "top"),
    board[["links"]]
  )

  expect_length(links, 1L)
  expect_identical(links[[1L]][["from"]], "filt")
  expect_identical(links[[1L]][["input"]], "data")

  expect_identical(app_statuses(app)[["top"]][["status"]], "ready")

  # R holds the block's result: the first three rows of the filtered data.
  result <- app_results(app)[["top"]]

  expect_identical(
    result,
    utils::head(subset(datasets::iris, Sepal.Length > 5), n = 3L)
  )

  # The page sent the edit's review with the next call.
  # The edit applied as one undo step and added the block and the link.
  # The review gives the block's status, and what describe_result() writes
  # about the result that R holds.
  outputs <- tool_outputs(turn_calls(mock)[[2L]])
  expect_length(outputs, 1L)

  review <- jsonlite::fromJSON(outputs[[1L]], simplifyVector = FALSE)

  expect_true(review[["applied"]])
  expect_true(review[["undo_step"]])
  expect_identical(unlst(review[["added"]][["blocks"]]), "top")
  expect_identical(unlst(review[["added"]][["links"]]), names(links))
  expect_identical(review[["blocks"]][["top"]][["status"]], "ready")
  expect_identical(
    review[["blocks"]][["top"]][["result"]],
    describe_result(result)
  )
})

test_that("a stop halfway through a turn keeps what the turn finished", {

  mock <- local_mock_api(
    mock_reply(mock_tool_call("edit", add_top)),
    mock_reply(mock_text("I added the block top, which", hold = TRUE)),
    mock_reply(mock_text("The block top shows three rows."))
  )

  app <- local_example_app("populated-board", mock_deployment(mock))

  send_message(app, "Show the first three rows of the filtered data.")

  # The edit applies, and then the reply streams half a sentence and holds,
  # while the turn runs.
  wait_for_chat_text(app, "I added the block top, which")
  expect_true(chat_has_button(app, "Stop"))

  click_chat_button(app, "Stop")
  conversation <- wait_for_reply(app, "I added the block top, which")

  # The edit stays on the board, and what the reply streamed entered the
  # conversation as the model's message.
  expect_true("top" %in% names(app_board(app)[["blocks"]]))
  wait_for_status(app, "top", "ready")

  expect_identical(
    message_roles(conversation),
    c("user", "assistant", "tool", "assistant")
  )

  # The chat takes a new message, whose turn goes on in the same
  # conversation.
  send_message(app, "How many rows does it show?")
  conversation <- wait_for_reply(app, "The block top shows three rows.")

  expect_identical(
    message_roles(conversation),
    c("user", "assistant", "tool", "assistant", "user", "assistant")
  )
})

test_that("a saved board opens again with its conversation, which goes on", {

  mock <- local_mock_api(
    mock_reply(mock_text("The board holds four blocks.")),
    mock_reply(mock_text("The block plot draws a scatter plot."))
  )

  app <- local_example_app("populated-board", mock_deployment(mock))

  send_message(app, "What is on the board?")
  wait_for_reply(app, "The board holds four blocks.")

  # The model titles the conversation once its first exchange ends.
  wait_until(
    function() {
      identical(chr_xtr(app_conversations(app), "title"), mock_title)
    },
    function() "the conversation's title"
  )

  conversation <- names(app_conversations(app))

  # Save downloads the board, with its conversation.
  # A reload opens the app's own board again, which holds none.
  file <- save_board(app, withr::local_tempdir())

  reload_page(app)
  expect_length(app_conversations(app), 0L)

  # Open opens the saved board, and the chat shows its conversation again.
  open_board(app, file)

  wait_until(
    function() identical(names(app_conversations(app)), conversation),
    function() "the saved board's conversation"
  )
  wait_for_chat_text(app, "The board holds four blocks.")

  # The conversation goes on: the call of the next turn carries the first
  # exchange before the user's new message, and the reply enters the same
  # conversation.
  send_message(app, "Which block draws the plot?")
  after <- wait_for_reply(app, "The block plot draws a scatter plot.")

  expect_identical(names(app_conversations(app)), conversation)
  expect_identical(
    message_roles(after),
    c("user", "assistant", "user", "assistant")
  )

  calls <- turn_calls(mock)
  expect_length(calls, 2L)

  expect_identical(
    head(conversation_texts(calls[[2L]]), 3L),
    c(
      "user: What is on the board?",
      "assistant: The board holds four blocks.",
      "user: Which block draws the plot?"
    )
  )
})

test_that("the assistant answers on the empty board", {

  mock <- local_mock_api(mock_reply(mock_text("Hello.")))
  app <- local_example_app("empty-board", mock_deployment(mock))

  expect_length(app_board(app)[["blocks"]], 0L)

  send_message(app, "Hello?")
  wait_for_reply(app, "Hello.")

  expect_length(turn_calls(mock), 1L)
})
