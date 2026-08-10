fake_chat_function <- function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(
    model = "gpt-4.1-nano",
    credentials = function() list(Authorization = "Bearer test"),
    echo = "none"
  )
}

with_llm_session <- function() {
  sess <- shiny::MockShinySession$new()
  blockr.core:::board_option_to_userdata(
    new_llm_model_option(),
    session = sess
  )
  sess
}

# Faithful stand-in for core's `update` reactiveVal: readable via update() and
# writable via update(payload). The assistant both reads it (touched-set
# capture) and writes it (flush), so a write-only function mock is unfaithful.
# `on_write` records the payload (or rejects, by stopping).
recording_update <- function(on_write = function(payload) invisible()) {

  rv <- shiny::reactiveVal()

  function(payload) {

    if (missing(payload)) {
      return(rv())
    }

    on_write(payload)
    rv(payload)
  }
}

# The chat module advertises its slash commands to the browser through a
# custom message; MockShinySession drops those, so tests that care swap in a
# recorder and read the last advertisement back out.
recording_session <- function() {

  sent <- list()
  sess <- with_llm_session()

  sess$sendCustomMessage <- function(type, message) {
    sent[[length(sent) + 1L]] <<- message
    invisible()
  }

  list(session = sess, slash_commands = function() last_slash_commands(sent))
}

last_slash_commands <- function(messages) {

  actions <- Filter(is_slash_command_action, messages)

  if (!length(actions)) {
    return(list())
  }

  actions[[length(actions)]]$action$commands
}

is_slash_command_action <- function(message) {
  identical(message$action$type, "update_slash_commands")
}
