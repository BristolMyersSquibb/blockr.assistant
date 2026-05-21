#' Assistant extension
#'
#' Mounts an `ellmer`-powered chat panel on a `blockr.dock` board.
#' Phase 1 wires the chat panel to an `ellmer::Chat` constructed from
#' the board's `llm_model` option; the assistant has no awareness of
#' the board yet -- tools and dynamic prompt context arrive in later
#' phases.
#'
#' The constructor signature mirrors the extension's `state` shape:
#' `system_prompt` and `messages` round-trip through `blockr.dock`'s
#' ser/des so that a saved board restores with the same persona and
#' the same conversation history. Model parameters (temperature,
#' max tokens, ...) are deliberately not part of this surface -- they
#' belong to the chat constructor, supplied via
#' `blockr.core::blockr_option("chat_function", ...)` or the board's
#' `llm_model` option.
#'
#' @param system_prompt Character scalar overriding the package default
#'   persona returned by [default_system_prompt()]. `NULL` uses the
#'   default.
#' @param messages Optional list of recorded turns (as produced by
#'   [ellmer::contents_record()]) to seed the conversation with on
#'   server start. `NULL` starts with an empty conversation.
#' @param ... Forwarded to [blockr.dock::new_dock_extension()].
#'
#' @return A `dock_extension` object additionally inheriting from
#'   `assistant_extension`.
#'
#' @examples
#' ext <- new_assistant_extension()
#' blockr.dock::is_dock_extension(ext)
#'
#' @export
new_assistant_extension <- function(system_prompt = NULL,
                                    messages = NULL,
                                    ...) {
  new_dock_extension(
    server = asst_ext_srv(system_prompt, messages),
    ui = asst_ext_ui,
    name = "Assistant",
    class = "assistant_extension",
    ...
  )
}

asst_ext_ui <- function(id, board, ...) {
  tagList(
    shinychat::chat_mod_ui(NS(id, "chat")),
    verbatimTextOutput(NS(id, "tokens"))
  )
}

asst_ext_srv <- function(system_prompt, messages) {

  function(id, board, update, ...) {

    moduleServer(
      id,
      function(input, output, session) {

        chat_ctor <- get_board_option_value("llm_model", session)
        sys_prompt <- coal(system_prompt, default_system_prompt())

        client <- chat_ctor(system_prompt = sys_prompt)

        if (length(messages)) {
          client$set_turns(lapply(messages, ellmer::contents_replay))
        }

        mod <- shinychat::chat_mod_server("chat", client)

        messages <- reactiveVal(coal(messages, list()))

        record_new_turns <- function() {

          recorded <- messages()
          turns <- client$get_turns()

          if (length(turns) > length(recorded)) {
            new_idx <- seq.int(length(recorded) + 1L, length(turns))
            messages(
              c(recorded, lapply(turns[new_idx], ellmer::contents_record))
            )
          } else if (length(turns) < length(recorded)) {
            messages(lapply(turns, ellmer::contents_record))
          }
        }

        observeEvent(mod$last_input(), record_new_turns(), ignoreNULL = TRUE)
        observeEvent(mod$last_turn(),  record_new_turns(), ignoreNULL = TRUE)

        output$tokens <- renderText(
          format_token_telemetry(mod$last_turn())
        )

        list(
          state = list(
            system_prompt = sys_prompt,
            messages      = messages
          )
        )
      }
    )
  }
}

format_token_telemetry <- function(turn) {

  if (is.null(turn) || all(is.na(turn@tokens))) {
    return("")
  }

  toks <- turn@tokens
  in_t  <- if (is.na(toks[1])) 0L else as.integer(toks[1])
  out_t <- if (is.na(toks[2])) 0L else as.integer(toks[2])

  sprintf(
    "input: %d   output: %d   total this turn: %d",
    in_t, out_t, in_t + out_t
  )
}
