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
