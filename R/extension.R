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

        chat_ctor <- isolate(get_board_option_value("llm_model", session))
        sys_prompt <- coal(system_prompt, default_system_prompt())

        client <- chat_ctor(system_prompt = sys_prompt)

        pending_update <- reactiveVal(empty_pending())

        register_read_tools(client, board, update, session)
        register_mutation_tools(client, board, pending_update, session)

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
            flush_pending(pending_update, update)
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        output$tokens <- renderUI(
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
