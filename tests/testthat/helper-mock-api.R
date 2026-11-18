# A mock of OpenAI's Responses API, to which the end-to-end tests send the
# assistant's calls (test-end-to-end.R).
# It runs in another R process, through webfakes, on a port of its own.
# So the page that a test opens calls it from another origin, and each call
# meets CORS as a call to a provider does.
# The mock answers each preflight with the headers that it asks for, and puts
# the page's origin in `Access-Control-Allow-Origin` on each answer.
# It also gives a list of models, which holds the model that the tests name.
#
# A test gives the mock the replies to the calls of its turns, in order.
# Each reply streams as the server-sent events of the Responses API, part by
# part: text, as `mock_text()` gives it, and calls of tools, as
# `mock_tool_call()` gives them.
# A text with `hold = TRUE` ends the reply halfway: the mock streams the text
# and then holds the stream open, until the page stops the call.
# A call that comes once the replies have run out gets the text `no_reply`.
# The plugin's own call for a conversation's title gets the title
# `mock_title`, and leaves the replies to the turns.
#
# The mock records the body of each call, as the page sent it, which a test
# reads with `mock_calls()`.

# The key that the tests give the deployment, and the model that it offers.
mock_key <- "test-key"
mock_model <- "gpt-5.4"

mock_title <- "Questions about the board"
no_reply <- "The mock has no reply left for this call."

# How the prompt of the plugin's call for a title starts, by which the mock
# tells that call apart.
title_prompt <- "You title chat conversations."

# A part of a reply: text that the model streams.
mock_text <- function(text, hold = FALSE) {
  list(type = "text", text = text, hold = hold)
}

# A part of a reply: a call of the tool given, with the args given.
mock_tool_call <- function(tool, args = list()) {
  list(type = "tool_call", tool = tool, args = args)
}

# A reply, the parts given in order.
mock_reply <- function(...) {
  list(...)
}

# Starts the mock with the replies given, and stops it as the frame given
# ends.
local_mock_api <- function(..., frame = parent.frame()) {

  testthat::skip_if_not_installed("webfakes")

  webfakes::local_app_process(
    mock_api_app(list(...)),
    opts = webfakes::server_opts(num_threads = 4L),
    .local_envir = frame
  )
}

# The R options of a deployment whose calls go to the mock: the blockr options
# that name the mock's base URL, the deployment's key and the one model that
# it offers.
mock_deployment <- function(mock) {
  list(
    blockr.assistant_base_url = mock$url("/v1"),
    blockr.assistant_api_key = mock_key,
    blockr.assistant_models = mock_model
  )
}

# The body of each call that reached the mock, in order, as R reads its JSON.
mock_calls <- function(mock) {
  lapply(
    jsonlite::fromJSON(mock$url("/__calls"), simplifyVector = FALSE),
    jsonlite::fromJSON,
    simplifyVector = FALSE
  )
}

# The calls of the turns, which leave out those for a title.
turn_calls <- function(mock) {
  Filter(Negate(is_title_call), mock_calls(mock))
}

# Whether the body is that of the plugin's call for a conversation's title.
is_title_call <- function(body) {
  grepl(title_prompt, jsonlite::toJSON(body, auto_unbox = TRUE), fixed = TRUE)
}

# The outputs of the tool calls that the body of a call carries, by the id of
# each call, as the page sends them back with the next call.
tool_outputs <- function(body) {

  items <- Filter(
    function(item) identical(item[["type"]], "function_call_output"),
    body[["input"]]
  )

  set_names(lst_xtr(items, "output"), chr_xtr(items, "call_id"))
}

# The texts of the messages of the user and of the model that the body of a
# call carries, in order, each after who it is from, as "user: Hello".
# The message of the app's, which follows the conversation's last message, is
# the user's too.
conversation_texts <- function(body) {

  items <- Filter(
    function(item) isTRUE(item[["role"]] %in% c("user", "assistant")),
    body[["input"]]
  )

  unlst(
    lapply(
      items,
      function(item) {
        content <- item[["content"]]
        texts <- if (is.character(content)) {
          content
        } else {
          parts <- Filter(function(part) not_null(part[["text"]]), content)
          chr_xtr(parts, "text")
        }
        paste0(item[["role"]], ": ", texts)
      }
    )
  )
}

# The web app of the mock.
# The mock's process gets a copy of the app, with what the app's handlers use.
# A test run under `pkgload::load_all()` sources the helpers into the
# package's namespace.
# The process would load that namespace from the installed package, which
# lacks the helpers.
# So the handlers run in an environment of their own, whose parent is the base
# environment.
# That environment holds a copy of each function and value that the handlers
# use (`mock_server_objects`).
mock_api_app <- function(replies) {

  server <- new.env(parent = baseenv())

  for (name in mock_server_objects) {
    value <- get(name)
    if (is.function(value)) {
      environment(value) <- server
    }
    assign(name, value, envir = server)
  }

  app <- webfakes::new_app()

  app$locals$replies <- replies
  app$locals$calls <- list()

  app$use(webfakes::mw_text(type = "application/json"))
  app$use(server$allow_origin)

  app$options(webfakes::new_regexp(".*"), server$answer_preflight)
  app$get("/v1/models", server$send_models)
  app$get("/__calls", server$send_calls)
  app$post("/v1/responses", server$stream_reply)

  app
}

# What the handlers of the mock use, by name.
mock_server_objects <- c(
  "allow_origin", "answer_preflight", "send_models", "send_calls",
  "stream_reply", "responses_events", "text_deltas", "tool_args_json",
  "sse_event", "mock_reply", "mock_text", "mock_model", "mock_title",
  "no_reply", "title_prompt"
)

# Allows the page's origin to read each answer.
allow_origin <- function(req, res) {

  origin <- req$get_header("Origin")

  res$set_header(
    "Access-Control-Allow-Origin",
    if (is.null(origin)) "*" else origin
  )

  "next"
}

# Answers a preflight with every header that it asks for.
answer_preflight <- function(req, res) {

  headers <- req$get_header("Access-Control-Request-Headers")

  res$set_header("Access-Control-Allow-Methods", "GET, POST")
  res$set_header(
    "Access-Control-Allow-Headers",
    if (is.null(headers)) "" else headers
  )

  res$send_status(204L)
}

# Gives the list of models, as OpenAI's API gives it, with the model that the
# tests name.
send_models <- function(req, res) {
  res$send_json(
    text = paste0(
      '{"object":"list","data":[{"id":"', mock_model, '",',
      '"object":"model","created":1782254706,"owned_by":"system"}]}'
    )
  )
}

# Gives the body of each call that reached the mock, as a JSON array of the
# texts.
send_calls <- function(req, res) {
  res$send_json(
    text = jsonlite::toJSON(as.character(unlist(req$app$locals$calls)))
  )
}

# Streams the reply to a call of the Responses API.
# It picks the reply as the call comes in, and then sends its events, until it
# sends them all or reaches a hold.
# There it holds the stream open: it has webfakes call it again a second
# later, which finds the hold again.
stream_reply <- function(req, res) {

  if (is.null(res$locals$events)) {

    locals <- req$app$locals
    locals$calls <- c(locals$calls, list(req$text))

    body <- jsonlite::fromJSON(req$text, simplifyVector = FALSE)
    titles <- grepl(title_prompt, req$text, fixed = TRUE)

    reply <- if (titles) {
      mock_reply(mock_text(mock_title))
    } else if (length(locals$replies)) {
      locals$replies[[1L]]
    } else {
      mock_reply(mock_text(no_reply))
    }

    if (!titles && length(locals$replies)) {
      locals$replies <- locals$replies[-1L]
    }

    res$locals$events <- responses_events(
      reply,
      if (is.null(body[["model"]])) mock_model else body[["model"]],
      length(locals$calls)
    )
    res$locals$sent <- 0L

    res$set_status(200L)
    res$set_type("text/event-stream")
    res$set_header("Cache-Control", "no-cache")
  }

  events <- res$locals$events

  while (res$locals$sent < length(events)) {

    event <- events[[res$locals$sent + 1L]]

    if (is.null(event)) {
      res$delay(1)
      return(invisible())
    }

    res$send_chunk(event)
    res$locals$sent <- res$locals$sent + 1L
  }

  invisible()
}

# The server-sent events of the Responses API that stream the reply given,
# from the model given, as the answer to the call of the number given.
# Where the reply holds, the events end with a `NULL`, which marks the hold.
responses_events <- function(reply, model, call) {

  response <- list(
    id = paste0("resp_", call),
    object = "response",
    created_at = 0L,
    status = "in_progress",
    model = model,
    output = list()
  )

  events <- list(list(type = "response.created", response = response))
  output <- list()

  for (i in seq_along(reply)) {

    part <- reply[[i]]
    index <- i - 1L

    if (identical(part[["type"]], "text")) {

      item <- list(
        type = "message",
        id = paste0("msg_", call, "_", i),
        role = "assistant",
        status = "in_progress",
        content = list()
      )

      events <- c(
        events,
        list(
          list(
            type = "response.output_item.added",
            output_index = index,
            item = item
          )
        ),
        lapply(
          text_deltas(part[["text"]]),
          function(delta) {
            list(
              type = "response.output_text.delta",
              item_id = item[["id"]],
              output_index = index,
              content_index = 0L,
              delta = delta
            )
          }
        )
      )

      if (isTRUE(part[["hold"]])) {
        return(c(lapply(events, sse_event), list(NULL)))
      }

      item[["status"]] <- "completed"
      item[["content"]] <- list(
        list(type = "output_text", text = part[["text"]], annotations = list())
      )

    } else {

      item <- list(
        type = "function_call",
        id = paste0("fc_", call, "_", i),
        call_id = paste0("call_", call, "_", i),
        name = part[["tool"]],
        arguments = tool_args_json(part[["args"]]),
        status = "completed"
      )

      events <- c(
        events,
        list(
          list(
            type = "response.output_item.added",
            output_index = index,
            item = c(
              item[c("type", "id", "call_id", "name")],
              list(arguments = "", status = "in_progress")
            )
          ),
          list(
            type = "response.function_call_arguments.delta",
            item_id = item[["id"]],
            output_index = index,
            delta = item[["arguments"]]
          ),
          list(
            type = "response.function_call_arguments.done",
            item_id = item[["id"]],
            output_index = index,
            arguments = item[["arguments"]]
          )
        )
      )
    }

    events <- c(
      events,
      list(
        list(type = "response.output_item.done", output_index = index,
             item = item)
      )
    )

    output <- c(output, list(item))
  }

  response[["status"]] <- "completed"
  response[["output"]] <- output
  response[["usage"]] <- list(
    input_tokens = 20L,
    output_tokens = 5L,
    total_tokens = 25L,
    input_tokens_details = list(cached_tokens = 0L),
    output_tokens_details = list(reasoning_tokens = 0L)
  )

  events <- c(
    events,
    list(list(type = "response.completed", response = response))
  )

  lapply(events, sse_event)
}

# The pieces in which the text given streams, a word each.
text_deltas <- function(text) {
  regmatches(text, gregexpr("\\s*\\S+", text))[[1L]]
}

# The args of a tool call as the JSON object that the Responses API streams.
tool_args_json <- function(args) {

  if (!length(args)) {
    return("{}")
  }

  as.character(jsonlite::toJSON(args, auto_unbox = TRUE))
}

# An event as the text of a server-sent event, named by its type.
sse_event <- function(event) {
  paste0(
    "event: ", event[["type"]], "\n",
    "data: ", jsonlite::toJSON(event, auto_unbox = TRUE), "\n\n"
  )
}
