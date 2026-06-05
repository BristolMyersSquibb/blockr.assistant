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
      uiOutput(NS(id, "chat_panel"), container = function(...) {
        div(class = "asst-chat-slot", ...)
      }),
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
      .asst-chat-slot.shiny-html-output {
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .asst-chat-slot shiny-chat-container {
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

  function(id, board, update, extensions = NULL, ...) {

    moduleServer(
      id,
      function(input, output, session) {

        compose <- if (is.function(system_prompt)) {
          system_prompt
        } else {
          force(system_prompt)
          function(...) system_prompt
        }

        pending_update   <- reactiveVal(empty_pending())
        last_flush_error <- reactiveVal(NULL)

        react <- reactiveValues(
          baseline  = list(),
          count     = 0L,
          seq       = 0L,
          settle    = NULL,
          feedback  = NULL,
          awaiting  = FALSE,
          injecting = FALSE
        )

        max_auto_react <- 2L
        settle_ms      <- 250

        messages_rec <- reactiveVal(coal(messages, list()))

        client_r   <- reactiveVal(NULL)
        mod_r      <- reactiveVal(NULL)
        mount_idx  <- reactiveVal(0L)

        chat_ctor_r <- reactive(
          get_board_option_value("llm_model", session)
        )

        make_client <- function(ctor, seed_turns) {

          cl <- ctor(system_prompt = "")

          register_read_tools(cl, board, update, session)
          register_mutation_tools(
            cl, board, pending_update, session
          )
          register_view_tools(
            cl, board, pending_update, session
          )
          register_board_options_tools(cl, board, session)

          if (inherits(isolate(board$board), "dock_board")) {
            register_extension_tools(
              cl, board, pending_update, extensions, session
            )
          }

          # Drop trailing turns that represent an incomplete or
          # failed exchange. Two shapes show up after a stream error
          # on the prior provider:
          # (a) An assistant turn with empty @contents -- ellmer's
          #     stream_async appends an assistant placeholder when
          #     it starts the stream and never fills it if the
          #     stream errors (e.g. OpenAI insufficient_quota).
          # (b) A trailing user turn with no following assistant
          #     turn at all -- the failure happened before even the
          #     placeholder was added.
          # Either renders on the new mount as a perpetual loading
          # spinner via shinychat::client_set_ui (which calls
          # chat_append for each turn; an empty assistant turn shows
          # as "waiting for response"). Trim until we hit a
          # complete exchange; the user can re-ask on the new
          # provider if they want the question answered.
          repeat {
            n <- length(seed_turns)
            if (!n) break
            last <- seed_turns[[n]]
            is_empty_assistant <- identical(last@role, "assistant") &&
              !length(last@contents)
            is_trailing_user <- identical(last@role, "user")
            if (!(is_empty_assistant || is_trailing_user)) break
            seed_turns <- seed_turns[-n]
          }

          if (length(seed_turns)) {
            cl$set_turns(seed_turns)
          }

          cl
        }

        # When the chat constructor changes (initial mount or after a
        # user-driven option swap), build a fresh client, migrate the
        # prior conversation, and bump mount_idx so the UI re-renders.
        # The whole build is wrapped: if the chat ctor errors (bad
        # API key check, provider construction failure) we surface
        # the error to the user rather than letting the observer
        # propagate it.
        observe({

          ctor <- chat_ctor_r()

          seed_turns <- isolate({
            prev <- client_r()
            if (!is.null(prev)) {
              prev$get_turns()
            } else if (length(messages)) {
              lapply(messages, ellmer::contents_replay)
            } else {
              list()
            }
          })

          new_client <- tryCatch(
            make_client(ctor, seed_turns),
            error = function(e) {
              notify(
                paste(
                  "Could not build chat client:",
                  conditionMessage(e)
                ),
                type = "error",
                duration = NULL,
                session = session
              )
              NULL
            }
          )

          if (is.null(new_client)) {
            return()
          }

          client_r(new_client)
          mount_idx(isolate(mount_idx()) + 1L)
        })

        output$chat_panel <- renderUI({
          shinychat::chat_mod_ui(session$ns(chat_sub_id(mount_idx())))
        })

        # Mount the chat module against the current client.
        # shinychat::chat_mod_server() calls chat_restore() internally,
        # which fires client_set_ui() on the next reactive flush --
        # that hook already replays every prior turn into the
        # freshly-rendered UI via chat_append(). No manual replay
        # needed (and earlier attempts targeted the wrong DOM id
        # because the chat container lives under shinychat's own
        # NS("chat")).
        observe({

          idx <- mount_idx()
          cl  <- client_r()

          req(cl)

          mod_r(shinychat::chat_mod_server(chat_sub_id(idx), cl))
        })

        refresh_prompt <- function() {

          cl <- client_r()
          if (is.null(cl)) return(invisible())

          prompt <- tryCatch(
            compose(board, cl, last_flush_error),
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
            cl$set_system_prompt(prompt)
          }
        }

        record_new_turns <- function() {

          cl <- isolate(client_r())
          if (is.null(cl)) return(invisible())

          recorded <- messages_rec()
          turns <- cl$get_turns()

          if (length(turns) > length(recorded)) {
            new_idx <- seq.int(length(recorded) + 1L, length(turns))
            messages_rec(
              c(
                recorded,
                lapply(turns[new_idx], ellmer::contents_record)
              )
            )
          } else if (length(turns) < length(recorded)) {
            messages_rec(lapply(turns, ellmer::contents_record))
          }
        }

        observe({
          board$board
          last_flush_error()
          client_r()
          refresh_prompt()
        })

        last_input_r <- reactive(req(mod_r())$last_input())
        last_turn_r  <- reactive(req(mod_r())$last_turn())

        auto_react <- function(msg) {

          if (is.null(msg) || isolate(react$count) >= max_auto_react) {
            return(invisible())
          }

          react$count    <- isolate(react$count) + 1L
          react$seq      <- isolate(react$seq) + 1L
          react$feedback <- list(n = isolate(react$seq), msg = msg)

          invisible()
        }

        observeEvent(
          react$feedback,
          {
            mod <- isolate(mod_r())

            if (is.null(mod)) {
              return()
            }

            react$injecting <- TRUE
            mod$update_user_input(
              value = react$feedback$msg, submit = TRUE
            )
          },
          ignoreNULL = TRUE
        )

        observeEvent(
          last_input_r(),
          {
            if (isolate(react$injecting)) {
              react$injecting <- FALSE
            } else {
              react$baseline <- snapshot_conditions(board)
              react$count <- 0L
            }

            reset_pending(pending_update)
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        observeEvent(
          last_turn_r(),
          {
            if (has_any_changes(isolate(pending_update()))) {
              react$awaiting <- TRUE
            }

            flush_pending(pending_update, update, last_flush_error)
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        observeEvent(
          board$last_update,
          {
            outcome <- board$last_update

            if (is.null(outcome) || !isolate(react$awaiting)) {
              return()
            }

            react$awaiting <- FALSE

            if (isFALSE(outcome$ok)) {
              auto_react(format_flush_feedback(outcome, list()))
            } else {
              react$settle <- list(seq = outcome$seq)
            }
          },
          ignoreNULL = TRUE
        )

        settle_fingerprint <- reactive({

          ctx <- react$settle

          if (is.null(ctx)) {
            return(NULL)
          }

          # Depend on every block's result and conditions so the debounce
          # re-arms until the post-apply re-evaluation cascade settles.
          for (srv in isolate(board$blocks)) {

            try(srv$server$result(), silent = TRUE)

            if (!is.null(srv$server$cond)) {
              reactiveValuesToList(srv$server$cond)
            }
          }

          ctx$seq
        })

        settled <- debounce(settle_fingerprint, settle_ms)

        observeEvent(
          settled(),
          {
            if (is.null(isolate(react$settle))) {
              return()
            }

            react$settle <- NULL

            auto_react(
              format_flush_feedback(
                list(ok = TRUE),
                new_block_conditions(
                  isolate(react$baseline),
                  snapshot_conditions(board)
                )
              )
            )
          },
          ignoreNULL = TRUE,
          ignoreInit = TRUE
        )

        output$tokens <- renderUI(
          format_token_telemetry(last_turn_r())
        )

        state_payload <- list(messages = messages_rec)

        if (is.character(system_prompt)) {
          state_payload$system_prompt <- system_prompt
        }

        list(state = state_payload)
      }
    )
  }
}

chat_sub_id <- function(idx) {
  sprintf("chat_%d", as.integer(idx))
}

turn_text <- function(turn) {

  texts <- chr_ply(
    seq_along(turn@contents),
    function(i) {
      x <- turn@contents[[i]]
      if (inherits(x, "ellmer::ContentText")) x@text else ""
    }
  )

  paste(texts[nzchar(texts)], collapse = "\n")
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
