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
#'   default [default_system_prompt()] composes a four-section
#'   prompt (intro / tool catalogue / skill catalogue / board
#'   summary); a caller can pass any function of the same shape.
#' * A **character scalar** is used verbatim as a static prompt -- no
#'   refresh, no auto-appended catalogue or board summary. The deal
#'   is "give up dynamic context, gain full prompt control".
#'   Block- and extension-scoped skills are unaffected: those ride in
#'   tool return values rather than the prompt.
#'
#' The `state` shape mirrors the constructor: `system_prompt` (when
#' the caller passed a string) round-trips through `blockr.dock`'s
#' ser/des. Function-valued `system_prompt` is omitted from `state` so
#' restore falls back to the constructor default (functions don't
#' serialise robustly across sessions).
#'
#' The conversation is saved alongside it and restored into the chat
#' when the board is reopened. How many of the most recent turns are
#' written is read at save time from the `blockr.chat_save_turns`
#' option (or the `BLOCKR_CHAT_SAVE_TURNS` environment variable),
#' which takes `0` for none, a positive whole number, or `Inf` for
#' all, and defaults to 50. Setting it to `0` is worth considering
#' where boards are shared, since the file otherwise carries whatever
#' was typed into the chat. It describes the deployment rather than
#' the board, so it is neither a constructor argument nor part of
#' `state` -- restore reads whatever the file holds.
#'
#' Turns are stored as an opaque [jsonlite::serializeJSON()] blob.
#' Recorded turns written into `state` directly do not survive the
#' board's JSON round trip -- `ellmer::contents_replay()` rejects the
#' integer `version` that comes back, and typed props such as `tokens`
#' return as lists -- and since the replay happens in a board-server
#' observer, such a board took the whole session down on restore
#' rather than just the chat panel. Payloads written in that earlier
#' shape are dropped on deserialisation. The raw provider response is
#' stripped before saving, and the saved window is trimmed to whole
#' exchanges so it never opens or closes on half of a tool call.
#'
#' The live conversation is bounded separately, since saving bounds
#' only the file: every turn is re-sent on every request, so an
#' unbounded session costs more as it goes and eventually exceeds the
#' provider's context window -- and because that limit is reached by
#' accumulation, every later message is over it too, leaving the chat
#' dead until the extension is remounted. Once an exchange exceeds the
#' threshold, the older part of the conversation is replaced by a
#' summary the model writes of it, and the recent turns are kept
#' verbatim. The threshold counts what the provider itself billed for
#' the last exchange rather than turns, that being what the context
#' window is actually spent in. A restored board is checked on mount as
#' well, so reopening a long conversation cannot land already over the
#' limit.
#'
#' That threshold is a **board option**, `chat_compact_tokens`, so a
#' user can retune it during a session -- the trade is recall against
#' how soon the chat starts summarising, and the right answer moves
#' with the model, which is itself swappable at runtime. `Inf` switches
#' compaction off. The deployment sets where it starts, through the
#' `blockr.chat_compact_tokens` option or the
#' `BLOCKR_CHAT_COMPACT_TOKENS` environment variable, defaulting to
#' 50000. Contrast [`chat_save_turns`][new_assistant_extension], which
#' stays a deployment setting because it governs whether conversations
#' may land in a shared file at all -- not a decision to hand to the
#' person whose conversation it is.
#'
#' Compaction rewrites the browser transcript to match, which is what
#' keeps the two honest. `shinychat` appends each turn to the DOM as it
#' arrives and never reads the client back, so turns dropped from the
#' client would otherwise stay on screen unremembered. The same replay
#' fills in a transcript that a restore or a provider swap leaves
#' empty; tool traffic carries no text and is not replayed.
#'
#' @param system_prompt Either a function (called each refresh with
#'   `(board, client, ...)` to build the prompt) or a character
#'   scalar (used verbatim, no refresh). Defaults to the
#'   exported [default_system_prompt] function.
#' @param messages Optional list of recorded turns (as produced by
#'   [ellmer::contents_record()]) to seed the conversation with on
#'   server start. `NULL` starts with an empty conversation. This is
#'   also how a restored board seeds the chat it was saved with.
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
    options = new_board_options(
      new_llm_model_option(), new_chat_compact_option()
    ),
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

        # Resolve the skill catalogue here rather than lazily inside the
        # client build: a mistyped skills directory should take the mount
        # down loudly, not degrade into an assistant that quietly answers
        # without the site's conventions.
        skill_catalogue()

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
          register_skill_tools(cl)
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

        # Mount the chat module against the current client. Every mount
        # renders a fresh, empty container -- chat_sub_id() changes with
        # mount_idx, and shinychat's own replay hook is out of reach here:
        # client_set_ui() is called only from chat_restore(), which
        # chat_server() reaches only when `history` is not FALSE. So the
        # transcript is ours to populate, via replay_transcript() below.
        #
        # history = FALSE is load-bearing. It defaults to TRUE, which opts
        # into shinychat's on-disk conversation store -- and that store
        # persists turns through the same ellmer record/replay pair that is
        # not JSON-safe: `version` is written as a double and read back as
        # an integer, which the type-strict `identical()` in
        # ellmer:::check_recorded() rejects as "Unsupported version 1.",
        # naming the value when it is the type that differs. The replay
        # aborts inside a restore observer, so the session dies. The store
        # is scoped per user (or per browser, unauthenticated) and survives
        # redeploys, so one poisoned record keeps killing that user's
        # sessions with nothing in the UI to clear it. Revisit once that
        # comparison is numeric upstream, and once the store's behaviour on
        # Connect is better understood.
        observe({

          idx <- mount_idx()
          cl  <- client_r()

          req(cl)

          mod <- shinychat::chat_mod_server(
            chat_sub_id(idx), cl, history = FALSE
          )

          # Advertising the slash commands is a one-shot push to the chat
          # element, so it has to wait for the flush that carries that
          # element's UI: registering in-line here sends it a flush early,
          # and the browser drops what it cannot yet address.
          session$onFlushed(
            function() register_skill_commands(mod, run_skill_command),
            once = TRUE
          )

          mod_r(mod)
        })

        # The client carries the conversation across a mount; the browser does
        # not. Restoring a saved board and swapping provider both land here
        # with turns the user never sees, so each fresh mount replays what the
        # client holds, then checks whether what it holds is already too big.
        observe({

          mod <- mod_r()

          req(mod)

          replay_transcript(mod, isolate(client_turns(client_r())))
          maybe_compact()
        })

        compacting <- local({

          running <- FALSE

          list(
            begin = function() {
              if (running) {
                return(FALSE)
              }
              running <<- TRUE
              TRUE
            },
            end = function() {
              running <<- FALSE
              invisible()
            }
          )
        })

        # Summarising is itself a request, so it happens off the live client on
        # a clone. Turns that arrive while it is in flight are carried over
        # rather than clobbered, and a stream that starts in the meantime defers
        # the swap: the bound is still exceeded next turn, so this runs again.
        apply_compaction <- function(cl, mod, summary, kept, seen) {

          if (identical(isolate(mod$status()), "streaming")) {
            return(invisible())
          }

          current <- cl$get_turns()

          arrived <- if (length(current) > seen) {
            current[seq.int(seen + 1L, length(current))]
          } else {
            list()
          }

          turns <- c(compacted_turns(summary, kept), arrived)

          cl$set_turns(turns)
          replay_transcript(mod, turns)

          invisible()
        }

        maybe_compact <- function() {

          cl  <- isolate(client_r())
          mod <- isolate(mod_r())

          if (is.null(cl) || is.null(mod)) {
            return(invisible())
          }

          turns <- cl$get_turns()

          # Isolated because the threshold is read at the moment a turn ends,
          # not depended on: the mount observer calls this, and a dependency
          # would replay the whole transcript every time the user retunes it.
          bound <- isolate(chat_compact_tokens(session))

          if (!over_context_bound(turns, bound)) {
            return(invisible())
          }

          split <- compaction_split(turns, compaction_keep_turns())

          if (is.null(split) || !compacting$begin()) {
            return(invisible())
          }

          seen <- length(turns)

          promises::finally(
            promises::catch(
              promises::then(
                summarise_turns(cl, split$summarise),
                function(summary) {
                  apply_compaction(cl, mod, summary, split$keep, seen)
                }
              ),
              function(e) {
                notify(
                  paste(
                    "Could not compact the conversation:",
                    conditionMessage(e)
                  ),
                  type = "warning",
                  session = session
                )
              }
            ),
            compacting$end
          )

          invisible()
        }

        refresh_prompt <- function() {

          cl <- client_r()
          if (is.null(cl)) return(invisible())

          prompt <- tryCatch(
            compose(
              board, cl, view_data = view_data, skills = skill_catalogue()
            ),
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

        # The turn to report telemetry for. A typed message settles through
        # shinychat's own stream task and shows up on last_turn_r(); a slash
        # command streams outside it and reports its turn here directly.
        shown_turn <- reactiveVal(NULL)

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

        on_model_turn <- function(turn) {

          shown_turn(turn)

          if (has_any_changes(isolate(pending_update()))) {
            nudge_or_discard()
          } else {
            maybe_compact()
          }

          invisible()
        }

        # A slash command never reaches shinychat's `_user_input`, so the
        # bookkeeping its observers do for a typed message -- resetting the
        # staging slate, the uncommitted-changes backstop, the token
        # telemetry -- is driven from here instead. The stream starts a tick
        # late on purpose: shinychat sends `remove_loading` the moment this
        # handler returns, and that finalises whatever message is streaming,
        # so a stream opened in-line is closed off again while still empty.
        run_skill_command <- function(skill, content) {

          mod <- isolate(mod_r())
          cl  <- isolate(client_r())

          content@text <- skill_command_prompt(skill, content@user_text)

          on_user_input()

          later::later(
            function() {
              promises::then(
                mod$append(cl$stream_async(content, stream = "content")),
                function(...) {
                  withReactiveDomain(session, on_model_turn(cl$last_turn()))
                }
              )
            }
          )

          invisible()
        }

        observeEvent(last_input_r(), on_user_input(), ignoreNULL = TRUE)

        observeEvent(
          last_turn_r(),
          on_model_turn(last_turn_r()),
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
          format_token_telemetry(shown_turn())
        )

        # Resolved by the board's serializer at save time, so the budget and
        # the turns are both read as they stand then.
        state_payload <- list(
          history = function() {
            isolate(
              serialize_chat_history(
                client_turns(client_r()),
                chat_save_turns()
              )
            )
          }
        )

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

# `keep` leaves the client alone -- the turns are set by the caller, which is
# the point: this is what stops the transcript and the model's memory drifting
# apart. Tool traffic carries no text and is not replayed.
replay_transcript <- function(mod, turns) {

  mod$clear(client_history = "keep")

  for (turn in turns) {

    if (!turn@role %in% c("user", "assistant")) {
      next
    }

    txt <- turn_text(turn)

    if (nzchar(txt)) {
      mod$append(txt, role = turn@role)
    }
  }

  invisible()
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
