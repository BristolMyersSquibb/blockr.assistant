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
#'   `(board, client, ...)` and must return a character scalar. The
#'   default [default_system_prompt()] composes a three-section
#'   prompt (intro / tool catalogue / board summary); a caller can
#'   pass any function of the same shape.
#' * A **character scalar** is used verbatim as a static prompt -- no
#'   refresh, no auto-appended catalogue or board summary. The deal
#'   is "give up dynamic context, gain full prompt control".
#'
#' The `state` shape mirrors the constructor: `system_prompt` (when
#' the caller passed a string) round-trips through `blockr.dock`'s
#' ser/des. Function-valued `system_prompt` is omitted from `state` so
#' restore falls back to the constructor default (functions don't
#' serialise robustly across sessions).
#'
#' The conversation itself is **not** part of `state`: a chat is
#' session scoped, while a saved board is a description of the
#' analysis. Recorded turns also do not survive the JSON round trip
#' (`ellmer::contents_replay()` rejects an integer `version` and the
#' `NA` `cost` / `duration` props come back as strings), so a board
#' saved with a recorded conversation used to abort on restore --
#' taking the whole board down with it, since the replay happens in a
#' board-server observer. Payloads written by those earlier versions
#' are dropped on deserialisation.
#'
#' @param system_prompt Either a function (called each refresh with
#'   `(board, client, ...)` to build the prompt) or a character
#'   scalar (used verbatim, no refresh). Defaults to the
#'   exported [default_system_prompt] function.
#' @param messages Optional list of recorded turns (as produced by
#'   [ellmer::contents_record()]) to seed the conversation with on
#'   server start. `NULL` starts with an empty conversation. Only
#'   in-session records replay reliably; the argument is not written
#'   to (nor read back from) board state.
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

  function(id, board, update, view_data = NULL, extensions = NULL, ...) {

    moduleServer(
      id,
      function(input, output, session) {

        compose <- if (is.function(system_prompt)) {
          system_prompt
        } else {
          force(system_prompt)
          function(...) system_prompt
        }

        pending_update <- reactiveVal(empty_pending())
        touched        <- reactiveVal(character())

        report <- reactiveValues(
          count     = 0L,
          seq       = 0L,
          nudge     = NULL,
          awaiting  = FALSE,
          injecting = FALSE
        )

        max_nudges <- 3L

        # The in-flight commit's state, bundled so only these methods touch it:
        # perform_commit arms the bridge with the pre-flush baseline and the
        # promise resolver; the board$last_update observer settles it a turn
        # later. The generation fences a resolved commit's stale timeout off a
        # subsequent commit.
        commit_bridge <- local({

          resolve  <- NULL
          baseline <- NULL
          gen      <- 0L

          list(
            arm = function(conditions, resolver) {
              baseline <<- conditions
              resolve  <<- resolver
              gen      <<- gen + 1L
              gen
            },
            settle = function(msg) {
              if (is.null(resolve)) {
                return(FALSE)
              }
              res <- resolve
              resolve <<- NULL
              res(msg)
              TRUE
            },
            baseline   = function() baseline,
            is_current = function(g) identical(g, gen)
          )
        })

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
            cl, board, pending_update, view_data, session
          )
          register_board_options_tools(cl, board, session)
          register_commit_tool(cl, perform_commit)
          register_discard_tool(cl, pending_update)

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
        #
        # history = FALSE is LOAD-BEARING, and not a preference.
        #
        # shinychat #266 added multi-conversation history, and
        # chat_mod_server() turns it on by DEFAULT -- so we opted into a
        # persistent conversation store simply by upgrading. Its
        # FileConversationStore writes each turn through
        # ellmer::contents_record(), which stamps `version` as a DOUBLE 1,
        # and reads it back with jsonlite::fromJSON(), which yields an
        # INTEGER 1. ellmer's check_recorded() tests
        # `identical(recorded$version, 1)` -- type-strict -- so the replay
        # aborts with "Unsupported version 1.", naming the value that is in
        # fact correct. It is the type that differs, which is why the
        # message reads as nonsense.
        #
        # The abort lands in a restore observer, so the session dies. Worse,
        # the store is deliberately redeploy-safe
        # ($CONNECT_CONTENT_DATA_DIR/shinychat-conversations): the FIRST
        # chat writes a record that every LATER session reads and dies on,
        # and redeploying does not clear it. One connection per process
        # buys nothing -- each fresh process re-reads the same file and
        # fails identically, which makes a disk problem look like a
        # process-level one.
        #
        # isFALSE(history) is what gates chat_enable_history() in
        # chat_server(), and chat_enable_history() is the ONLY caller of the
        # failing set_turns_recorded(). So this both stops new records being
        # written and makes any already-poisoned ones inert.
        #
        # Disabling rather than substituting a store is deliberate. The
        # conversation is SESSION state, not something to persist -- the
        # same call this branch exists to make. An in-memory store would
        # also be pointless here: it is per process, so with one connection
        # per process every drawer would open empty.
        #
        # Revisit only once check_recorded() compares numerically, or the
        # store parses with a type-preserving reader (reported upstream).
        observe({

          idx <- mount_idx()
          cl  <- client_r()

          req(cl)

          mod_r(
            shinychat::chat_mod_server(chat_sub_id(idx), cl, history = FALSE)
          )
        })

        refresh_prompt <- function() {

          cl <- client_r()
          if (is.null(cl)) return(invisible())

          prompt <- tryCatch(
            compose(board, cl, view_data = view_data),
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

        observe({
          board$board
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

        flush_review <- function(baseline, header) {

          format_flush_feedback(
            list(ok = TRUE),
            added_conditions(baseline, isolate(board$conditions())),
            collect_touched_results(isolate(touched()), board),
            header = header
          )
        }

        settle_commit <- function(msg) {

          if (commit_bridge$settle(msg)) {
            report$awaiting <- FALSE
          }

          invisible()
        }

        perform_commit <- function() {

          if (!has_any_changes(isolate(pending_update()))) {
            return(
              paste(
                "Nothing is staged. Stage changes with the mutation tools,",
                "then commit."
              )
            )
          }

          touched(character())
          report$awaiting <- TRUE

          promises::promise(
            function(resolve, reject) {

              gen <- commit_bridge$arm(isolate(board$conditions()), resolve)

              later::later(
                function() {
                  if (commit_bridge$is_current(gen)) {
                    settle_commit(commit_timeout_note())
                  }
                },
                delay = commit_timeout_secs()
              )

              flush_pending(pending_update, update)
            }
          )
        }

        nudge_model <- function(msg) {

          report$seq <- isolate(report$seq) + 1L
          report$nudge <- list(n = isolate(report$seq), msg = msg)

          invisible()
        }

        # The model ended a turn with staged changes it never committed.
        # Nothing has been applied -- prompt it to resolve them explicitly.
        # A bounded number of prompts, then the staged changes are dropped so
        # an ignored nudge cannot loop and nothing applies without a commit.
        nudge_or_discard <- function() {

          if (isolate(report$count) >= max_nudges) {
            reset_pending(pending_update)
            return(invisible())
          }

          report$count <- isolate(report$count) + 1L
          nudge_model(uncommitted_nudge())

          invisible()
        }

        observeEvent(
          report$nudge,
          {
            mod <- isolate(mod_r())

            if (is.null(mod)) {
              return()
            }

            report$injecting <- TRUE
            mod$update_user_input(
              value = report$nudge$msg, submit = TRUE
            )
          },
          ignoreNULL = TRUE
        )

        # A fresh user turn resets the staging slate -- but our own injected
        # nudge arrives as a synthetic user turn too, and must not wipe the
        # pending it is asking the model to resolve.
        on_user_input <- function() {

          if (isolate(report$injecting)) {
            report$injecting <- FALSE
          } else {
            report$count <- 0L
            reset_pending(pending_update)
            touched(character())
          }
        }

        observeEvent(last_input_r(), on_user_input(), ignoreNULL = TRUE)

        observeEvent(
          last_turn_r(),
          {
            if (has_any_changes(isolate(pending_update()))) {
              nudge_or_discard()
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

            # A commit is in flight -- `awaiting` is set only by perform_commit,
            # which arms the bridge before dispatching. Answer it in-band: a
            # rejected update resolves at once; a successful one waits for the
            # block re-evaluation it triggered to drain on the next flush before
            # collecting the touched results.
            if (isFALSE(outcome$ok)) {
              settle_commit(
                format_flush_feedback(outcome, header = commit_reject_header())
              )
              return()
            }

            session$onFlushed(
              function() {
                review <- flush_review(
                  commit_bridge$baseline(), commit_header()
                )
                settle_commit(
                  coal(review, commit_clean_note(), fail_all = FALSE)
                )
              },
              once = TRUE
            )
          },
          ignoreNULL = TRUE
        )

        output$tokens <- renderUI(
          format_token_telemetry(last_turn_r())
        )

        # The conversation is deliberately absent: it is session state, not
        # board state, and a recorded turn does not survive the board's JSON
        # round trip (see the constructor docs).
        state_payload <- list()

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
