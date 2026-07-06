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
        touched          <- reactiveVal(character())

        report <- reactiveValues(
          baseline  = NULL,
          count     = 0L,
          seq       = 0L,
          feedback  = NULL,
          awaiting  = FALSE,
          injecting = FALSE,
          # immediate-commit bookkeeping: whether anything applied during the
          # current model turn, the last mid-turn apply failure, and the
          # consecutive problem-round counter driving surrender guidance
          turn_active = FALSE,
          applied     = FALSE,
          mid_fail    = NULL,
          consec      = 0L
        )

        max_auto_react <- as.integer(
          blockr_option("assistant_autocorrect_rounds", 3L)
        )

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

        # Capture the blocks the model touched this turn off core's `update`
        # reactiveVal. By the time a default-priority observer sees it,
        # preprocess_board_update has expanded block removals into explicit
        # link removals -- so we reuse core's cleanup instead of recomputing
        # it. Gated on `awaiting`: only the model's own flush counts, not
        # dock's background updates.
        observeEvent(
          update(),
          {
            if (isolate(report$awaiting)) {
              touched(
                union(
                  isolate(touched()),
                  touched_blocks(isolate(update()), isolate(board$board))
                )
              )
            }
          }
        )

        auto_react <- function(msg) {

          if (is.null(msg) || isolate(report$count) >= max_auto_react) {
            return(invisible())
          }

          report$count <- isolate(report$count) + 1L
          report$seq <- isolate(report$seq) + 1L
          report$feedback <- list(n = isolate(report$seq), msg = msg)

          invisible()
        }

        observeEvent(
          report$feedback,
          {
            mod <- isolate(mod_r())

            if (is.null(mod)) {
              return()
            }

            report$injecting <- TRUE
            mod$update_user_input(
              value = report$feedback$msg, submit = TRUE
            )
          },
          ignoreNULL = TRUE
        )

        # The consolidated post-apply review: rejection/new-conditions/results
        # feedback, escalating to surrender guidance after two consecutive
        # rounds that still show problems. Runs onFlushed so the block
        # re-evaluation an update triggers has drained.
        schedule_review <- function(fail_outcome = NULL) {

          session$onFlushed(
            function() {

              newcond <- added_conditions(
                isolate(report$baseline),
                isolate(board$conditions())
              )

              results <- collect_touched_results(isolate(touched()), board)

              fb <- format_flush_feedback(
                coal(fail_outcome, list(ok = TRUE)),
                newcond,
                results
              )

              has_problem <- (!is.null(fail_outcome) &&
                isFALSE(fail_outcome$ok)) ||
                (!is.null(newcond) && nrow(newcond) > 0L) ||
                length(attr(results, "noop_ids")) > 0L

              if (has_problem) {
                report$consec <- isolate(report$consec) + 1L
                if (!is.null(fb) && isolate(report$consec) >= 2L) {
                  err <- if (!is.null(fail_outcome)) fail_outcome$message
                  fb <- paste(fb, surrender_guidance(err), sep = "\n\n")
                }
              } else {
                report$consec <- 0L
              }

              auto_react(fb)
            },
            once = TRUE
          )
        }

        observeEvent(
          last_input_r(),
          {
            if (isolate(report$injecting)) {
              report$injecting <- FALSE
            } else {
              report$baseline <- isolate(board$conditions())
              report$count <- 0L
              report$consec <- 0L
            }

            report$turn_active <- TRUE
            report$applied <- FALSE
            report$mid_fail <- NULL

            reset_pending(pending_update)
            touched(character())
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        # Immediate-commit mode: flush each staged mutation as soon as it is
        # staged, so the block goes live and the model can read its real
        # result mid-turn (get_block_result) and self-correct -- instead of
        # building blind until the turn-end flush. Relies on the async chat
        # flushing between tool calls. The turn-end flush below becomes a
        # no-op once everything is already applied.
        if (immediate_commit()) {
          observeEvent(
            pending_update(),
            {
              if (has_any_changes(isolate(pending_update()))) {
                report$awaiting <- TRUE
                flush_pending(pending_update, update, last_flush_error)
              }
            },
            ignoreInit = TRUE
          )
        }

        observeEvent(
          last_turn_r(),
          {
            report$turn_active <- FALSE

            leftover <- has_any_changes(isolate(pending_update()))

            if (leftover) {
              report$awaiting <- TRUE
            }

            flush_pending(pending_update, update, last_flush_error)
            record_new_turns()

            if (!leftover) {
              if (isolate(report$applied)) {
                # immediate mode applied everything mid-turn; there is no
                # upcoming last_update event, so run the review now
                schedule_review(isolate(report$mid_fail))
              } else if (
                promises_action(
                  tryCatch(turn_text(last_turn_r()), error = function(e) "")
                )
              ) {
                # nothing staged, nothing applied, yet the reply promises
                # action: the silent-stop failure -- nudge once
                auto_react(no_progress_feedback())
              }
            }
          },
          ignoreNULL = TRUE
        )

        observeEvent(
          board$last_update,
          {
            outcome <- board$last_update

            if (is.null(outcome) || !isolate(report$awaiting)) {
              return()
            }

            report$awaiting <- FALSE

            if (isolate(report$turn_active)) {
              # mid-turn apply (immediate mode): the model verifies itself
              # via get_block_result; stash failures for the consolidated
              # post-turn review instead of injecting into a running turn
              report$applied <- TRUE
              if (isFALSE(outcome$ok)) {
                report$mid_fail <- outcome
              }
              return()
            }

            if (isFALSE(outcome$ok)) {
              report$consec <- isolate(report$consec) + 1L
              fb <- format_flush_feedback(outcome)
              if (!is.null(fb) && isolate(report$consec) >= 2L) {
                fb <- paste(
                  fb, surrender_guidance(outcome$message),
                  sep = "\n\n"
                )
              }
              auto_react(fb)
              return()
            }

            schedule_review()
          },
          ignoreNULL = TRUE
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
