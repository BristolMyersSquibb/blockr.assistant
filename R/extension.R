#' Assistant extension
#'
#' Mounts an `ellmer`-powered chat panel on a `blockr.dock` board.
#' The chat client is built from the board's `llm_model` option and
#' wired with the read and mutation tools; the system prompt is
#' refreshed on every materialized board change so the model always
#' sees the current shape of the board.
#'
#' The `system_prompt` argument controls the prompt the model sees:
#'
#' * A **function** is called on every refresh with
#'   `(board, client, last_flush, ...)` and must return a character
#'   scalar. The default [default_system_prompt()] composes a
#'   four-section prompt (intro / tool catalogue / board summary /
#'   optional flush-rejection note); a caller can pass any function
#'   of the same shape.
#' * A **character scalar** is used verbatim as a static prompt -- no
#'   refresh, no auto-appended catalogue or board summary. The deal
#'   is "give up dynamic context, gain full prompt control".
#'
#' The `state` shape mirrors the constructor: `system_prompt` (when
#' the caller passed a string) and `messages` round-trip through
#' `blockr.dock`'s ser/des. Function-valued `system_prompt` is
#' omitted from `state` so restore falls back to the constructor
#' default (functions don't serialise robustly across sessions).
#'
#' @param system_prompt Either a function (called each refresh with
#'   `(board, client, last_flush, ...)` to build the prompt) or a
#'   character scalar (used verbatim, no refresh). Defaults to the
#'   exported [default_system_prompt] function.
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
new_assistant_extension <- function(system_prompt = default_system_prompt,
                                    messages = NULL,
                                    ...) {
  new_dock_extension(
    server = asst_ext_srv(system_prompt, messages),
    ui = asst_ext_ui,
    name = "Assistant",
    class = "assistant_extension",
    options = new_board_options(new_llm_model_option()),
    ...
  )
}

asst_ext_ui <- function(id, board, ...) {
  tagList(
    asst_ext_styles(),
    div(
      class = "asst-panel",
      shinychat::chat_mod_ui(NS(id, "chat")),
      uiOutput(NS(id, "tokens"), container = function(...) {
        div(class = "asst-token-slot", ...)
      })
    )
  )
}

asst_ext_styles <- function() {
  tags$style(
    HTML(
      "
      /* blockr.dock wraps every extension UI in an unnamed div with no
         height; without anchoring it here, our height:100% resolves to
         content size and we overflow the dock-panel boundary. */
      :has(> .asst-panel) {
        height: 100%;
      }
      .asst-panel {
        padding: 0 10px 14px 10px;
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
      }
      .asst-panel > shiny-chat-container {
        flex: 1 1 0;
        min-height: 0;
      }
      .asst-token-slot.shiny-html-output {
        display: flex;
        justify-content: flex-end;
        flex: 0 0 auto;
        width: min(680px, 100%);
        margin: 0 auto;
        min-height: 21px;
        padding: 10px 4px 0 4px;
      }
      .asst-meta {
        display: inline-flex;
        align-items: center;
        gap: 14px;
        font-size: 11px;
        line-height: 1;
        color: var(--bs-secondary-color, #6c757d);
        font-variant-numeric: tabular-nums slashed-zero;
      }
      .asst-meta-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: default;
        transition: color 120ms ease;
      }
      .asst-meta-item:hover {
        color: var(--bs-body-color, #212529);
      }
      .asst-meta-item svg {
        width: 12px;
        height: 12px;
        opacity: 0.75;
      }
      .asst-meta-num {
        font-weight: 500;
      }
      "
    )
  )
}

asst_ext_srv <- function(system_prompt, messages) {

  function(id, board, update, ...) {

    moduleServer(
      id,
      function(input, output, session) {

        chat_ctor <- isolate(
          get_board_option_value("llm_model", session)
        )

        compose <- if (is.function(system_prompt)) {
          system_prompt
        } else {
          force(system_prompt)
          function(...) system_prompt
        }

        pending_update   <- reactiveVal(empty_pending())
        last_flush_error <- reactiveVal(NULL)

        client <- chat_ctor(system_prompt = "")

        register_read_tools(client, board, update, session)
        register_mutation_tools(
          client, board, pending_update, session
        )

        refresh_prompt <- function() {

          prompt <- tryCatch(
            compose(board, client, last_flush_error),
            error = function(e) {
              notify(
                paste(
                  "Assistant prompt update failed:",
                  conditionMessage(e)
                ),
                type = "error"
              )
              NULL
            }
          )

          if (!is.null(prompt)) {
            client$set_system_prompt(prompt)
          }
        }

        refresh_prompt()

        if (length(messages)) {
          client$set_turns(
            lapply(messages, ellmer::contents_replay)
          )
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

        observe({
          board$board
          last_flush_error()
          refresh_prompt()
        })

        observeEvent(
          mod$last_input(),
          {
            reset_pending(pending_update)
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        observeEvent(
          mod$last_turn(),
          {
            flush_pending(pending_update, update, last_flush_error)
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        output$tokens <- renderUI(
          format_token_telemetry(mod$last_turn())
        )

        state_payload <- list(messages = messages)

        if (is.character(system_prompt)) {
          state_payload$system_prompt <- system_prompt
        }

        list(state = state_payload)
      }
    )
  }
}

format_token_telemetry <- function(turn) {

  if (is.null(turn) || all(is.na(turn@tokens))) {
    return(NULL)
  }

  toks <- turn@tokens
  in_t  <- if (is.na(toks[1])) 0L else as.integer(toks[1])
  out_t <- if (is.na(toks[2])) 0L else as.integer(toks[2])

  meta_item <- function(icon, value, title) {
    span(
      class = "asst-meta-item",
      title = title,
      bsicons::bs_icon(icon),
      span(class = "asst-meta-num", format(value, big.mark = ","))
    )
  }

  div(
    class = "asst-meta",
    meta_item(
      "arrow-up-short", in_t,
      sprintf("Input tokens (this turn): %d", in_t)
    ),
    meta_item(
      "arrow-down-short", out_t,
      sprintf("Output tokens (this turn): %d", out_t)
    )
  )
}
