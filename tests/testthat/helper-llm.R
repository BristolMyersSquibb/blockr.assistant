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
