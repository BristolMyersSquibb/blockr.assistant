fake_chat_function <- function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(
    model = "gpt-4.1-nano",
    credentials = function() list(Authorization = "Bearer test"),
    echo = "none"
  )
}

# Stand-in for the shinychat module object. chat_append() is UI-only and
# leaves nothing on the client to read back, so the browser transcript is
# unobservable unless something records it -- which is why `transcript()` is
# here. Mocking chat_mod_server() to NULL, as the other tests do, makes
# `mod_r` NULL and takes every mod-driven path out of reach.
fake_chat_mod <- function(status = "idle") {

  log <- character()

  list(
    clear = function(messages = NULL, greeting = FALSE,
                     client_history = c("clear", "set", "append", "keep")) {
      log <<- character()
      invisible()
    },
    append = function(response, role = "assistant", icon = NULL) {
      log <<- c(log, paste0(role, ": ", response))
      invisible()
    },
    status = shiny::reactive(status),
    transcript = function() log,
    last_turn = shiny::reactiveVal(NULL),
    last_input = shiny::reactiveVal(NULL),
    update_user_input = function(...) invisible(),
    slash_command = function(name, description, handler) invisible()
  )
}

with_llm_session <- function() {

  sess <- shiny::MockShinySession$new()

  for (opt in list(new_llm_model_option(), new_chat_compact_option())) {
    blockr.core:::board_option_to_userdata(opt, session = sess)
  }

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

alternating_turns <- function(n) {
  lapply(
    seq_len(n),
    function(i) {
      ellmer::Turn(
        if (i %% 2L) "user" else "assistant", as.character(i)
      )
    }
  )
}

priced_turns <- function(n, input, output) {

  turns <- alternating_turns(n)
  turns[[n]]@tokens <- c(input, output, NA)

  lapply(turns, ellmer::contents_record)
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
