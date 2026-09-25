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
# here. It logs what was appended and nothing else: emptying the browser's
# copy goes through `shinychat::chat_clear()` rather than the module, so a
# test that needs the reset drives the real module instead. Mocking
# chat_server() to NULL, as the other tests do, makes `mod_r` NULL and takes
# every mod-driven path out of reach.
#
# The `clear()` member refuses the way the real one does while conversation
# history is enabled, which the panel always does. A double that cleared
# instead is what kept compaction passing here while it aborted against a
# real module.
fake_chat_mod <- function(status = "idle") {

  log <- character()

  list(
    clear = function(...) {
      stop(
        "Can't clear a chat with conversation history enabled. Use ",
        "`chat$new_chat()` to start a new conversation."
      )
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
    set_client = function(new_client, sync = TRUE) invisible(),
    # Holds on to the restore callback so a test can fire it. Restoring is
    # what shinychat does when the browser names the thread it had open, and
    # it is the trigger a conversation already over the compaction bound
    # arrives through.
    #
    # Carries `on_save` and `on_restore`, and no `save()`. This double used
    # to offer one, which the module did not have when the production call
    # was written, so `mod$history$save()` passed wherever the module was
    # mocked while aborting every board save on prod with "attempt to apply
    # non-function". Upstream has added a module-level `save()` since, in
    # shinychat `7484ce6e` (2026-08-25), so a current session does carry
    # one. Leaving it off here is deliberate rather than a fidelity claim:
    # a double without `save()` is what stops this package's save path from
    # quietly taking a dependency on it again.
    #
    # The `restore()` member is a test affordance, not a claim about
    # shinychat: it fires the callback the module would have fired, and no
    # production code reads it.
    history = local({

      restore_fn <- NULL

      list(
        on_save = function(fn) invisible(fn),
        on_restore = function(fn) {
          restore_fn <<- fn
          invisible(fn)
        },
        restore = function(values = list()) {
          if (!is.null(restore_fn)) {
            restore_fn(values)
          }
          invisible()
        }
      )
    }),
    slash_command = function(name, description, handler, ..., echo = NULL,
                             force = FALSE) {
      invisible()
    }
  )
}

with_llm_session <- function() {

  sess <- shiny::MockShinySession$new()

  opts <- list(
    new_llm_model_option(), new_chat_compact_option(), new_chat_keep_option()
  )

  for (opt in opts) {
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

  turns
}

# The chat module talks to the browser through custom messages -- the slash
# commands it advertises, the transcript it draws. MockShinySession drops
# those, so tests that care swap in a recorder and read them back out.
recording_session <- function() {

  sent <- list()
  sess <- with_llm_session()

  sess$sendCustomMessage <- function(type, message) {
    sent[[length(sent) + 1L]] <<- message
    invisible()
  }

  list(
    session = sess,
    slash_commands = function() last_slash_commands(sent),
    transcript = function() transcript_since_clear(sent)
  )
}

# What the browser was last told to show, in the `role: text` form that
# `fake_chat_mod()` logs: everything after the most recent clear, where a
# message opens on its role and its text follows in chunks. NULL if nothing
# ever cleared it.
transcript_since_clear <- function(messages) {

  actions <- Filter(not_null, lst_xtr(Filter(is.list, messages), "action"))
  cleared <- which(chr_xtr(actions, "type") == "clear")

  if (!length(cleared)) {
    return(NULL)
  }

  shown <- character()

  for (action in actions[-seq_len(max(cleared))]) {

    if (identical(action$type, "chunk_start")) {
      shown <- c(shown, paste0(action$message$role, ": "))
    } else if (identical(action$type, "chunk")) {
      shown[length(shown)] <- paste0(shown[length(shown)], action$content)
    }
  }

  shown
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

# Points at a port nothing listens on, so the first request is refused and
# the turn is rejected before it streams anything.
dead_chat_function <- function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(
    model = "gpt-4.1-nano",
    base_url = "http://127.0.0.1:1/v1",
    credentials = function() list(Authorization = "Bearer test"),
    echo = "none"
  )
}
