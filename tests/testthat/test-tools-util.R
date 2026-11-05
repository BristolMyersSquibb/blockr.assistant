# One tool call through ellmer against mocked responses.
# Returns the request that follows it, decoded from the bytes curl would send.
request_after_tool_call <- function(tool, arguments = "{}") {

  reply <- function(message, finish) {
    list(
      id = "r_1", object = "chat.completion", created = 0L, model = "m",
      choices = list(
        list(index = 0L, message = message, finish_reason = finish)
      ),
      usage = list(
        prompt_tokens = 1L, completion_tokens = 1L, total_tokens = 2L
      )
    )
  }

  call <- list(
    role = "assistant",
    content = NULL,
    tool_calls = list(
      list(
        id = "call_1",
        type = "function",
        `function` = list(name = tool@name, arguments = arguments)
      )
    )
  )

  sent <- new.env()
  sent$bodies <- list()

  mock <- function(req) {

    sent$bodies <- c(
      sent$bodies,
      list(httr2::req_dry_run(req, quiet = TRUE)$body)
    )

    if (length(sent$bodies) == 1L) {
      return(httr2::response_json(body = reply(call, "tool_calls")))
    }

    httr2::response_json(
      body = reply(list(role = "assistant", content = "Done."), "stop")
    )
  }

  client <- ellmer::chat_openai_compatible(
    base_url = "http://127.0.0.1:9/v1",
    model = "m",
    credentials = function() "test",
    echo = "none"
  )

  client$register_tool(prepare_tool(tool))

  httr2::with_mocked_responses(mock, client$chat("Go."))

  jsonlite::fromJSON(rawToChar(sent$bodies[[2L]]), simplifyVector = FALSE)
}

tool_message <- function(request) {
  Filter(function(m) identical(m$role, "tool"), request$messages)[[1L]]
}

test_that("a Content tool result is handed over as it is", {

  text <- ellmer::ContentText("a")
  failed <- ellmer::ContentToolResult(error = "boom")

  expect_identical(normalize_tool_result("a"), "a")
  expect_identical(normalize_tool_result(text), text)
  expect_identical(normalize_tool_result(list(text, text)), list(text, text))
  expect_identical(normalize_tool_result(failed), failed)
})

test_that("any other tool result becomes a plain-character JSON string", {

  # Plain character, never `json`-classed: ellmer sends a `json`-classed value
  # as a toolResult `json` content block the BMS gateway rejects; a plain string
  # goes out as text.
  json <- jsonlite::toJSON(list(id = "d"), auto_unbox = TRUE)
  res_json <- normalize_tool_result(json)
  expect_type(res_json, "character")
  expect_false(inherits(res_json, "json"))
  expect_identical(res_json, "{\"id\":\"d\"}")

  frame <- normalize_tool_result(data.frame(id = c("d", "h")))
  expect_type(frame, "character")
  expect_false(inherits(frame, "json"))
  expect_identical(frame, "[{\"id\":\"d\"},{\"id\":\"h\"}]")

  expect_identical(normalize_tool_result(NULL), "{}")
  expect_identical(normalize_tool_result(list(n = 1L)), "{\"n\":1}")
  expect_identical(normalize_tool_result(c("a", "b")), "a\nb")
})

test_that("the value of a ContentToolResult is converted", {

  res <- normalize_tool_result(
    ellmer::ContentToolResult(value = list(id = "d"), extra = list(x = 1))
  )

  expect_s3_class(res, "ellmer::ContentToolResult")
  expect_identical(unclass(res@value), "{\"id\":\"d\"}")
  expect_identical(res@extra, list(x = 1))
})

test_that("a promised tool result is converted once it resolves", {

  out <- new.env()

  promises::then(
    normalize_tool_result(promises::promise_resolve(list(id = "d"))),
    function(x) out$value <- x
  )

  while (!later::loop_empty()) {
    later::run_now()
  }

  expect_identical(unclass(out$value), "{\"id\":\"d\"}")
})

# Handed a data.frame, ellmer would send the same JSON with a deprecation
# warning, which shows once a session and never to expect_no_warning().
# So the test reads what ellmer is handed.
test_that("every registered tool has its results converted", {

  client <- fake_chat_function()

  client$register_tool(
    ellmer::tool(function() NULL, name = "nothing", description = "Nothing.")
  )
  client$register_tool(
    ellmer::tool(
      function() data.frame(id = c("d", "h")),
      name = "frame",
      description = "Frame."
    )
  )

  prepare_tools(client)

  tools <- client$get_tools()

  expect_identical(unclass(tools$nothing()), "{}")
  expect_type(tools$frame(), "character")
  expect_false(inherits(tools$frame(), "json"))
})

test_that("a NULL result reaches the provider as a string", {

  skip_if_not_installed("httr2")

  req <- request_after_tool_call(
    ellmer::tool(function() NULL, name = "nothing", description = "Nothing.")
  )

  expect_identical(tool_message(req)$content, "{}")
})

test_that("the value of a returned ContentToolResult reaches it as a string", {

  skip_if_not_installed("httr2")

  req <- request_after_tool_call(
    ellmer::tool(
      function() ellmer::ContentToolResult(value = list(id = "d")),
      name = "result",
      description = "Result."
    )
  )

  expect_identical(tool_message(req)$content, "{\"id\":\"d\"}")
})

test_that("a plot that inspect_results draws reaches the model as an image", {

  skip_if_not_installed("httr2")

  brd <- reactiveValues(
    board = new_board(),
    blocks = list(ok = list(server = list(result = reactive(1:3)))),
    eval = reactiveValues(ok = reactive("ready"))
  )

  req <- isolate(
    request_after_tool_call(
      tool_inspect_results(brd, NULL, NULL),
      "{\"code\":\"plot(ok)\"}"
    )
  )

  users <- Filter(function(m) identical(m$role, "user"), req$messages)

  expect_no_match(
    tool_message(req)$content,
    "Tool calling failed",
    fixed = TRUE
  )
  expect_contains(chr_xtr(users[[length(users)]]$content, "type"), "image_url")
})
