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
#' Conversations are saved alongside it and restored into the chat when
#' the board is reopened. The chat holds several of them: the history
#' control in the footer opens a drawer listing every thread on this
#' board, with switching, renaming, deletion and model-written titles,
#' and the whole set rides into `state` as recorded turns. How many of
#' the most recent turns are written **per thread** is read at save
#' time from the `blockr.chat_save_turns` option (or the
#' `BLOCKR_CHAT_SAVE_TURNS`
#' environment variable), which takes `0` for none, a positive whole
#' number, or `Inf` for all, and defaults to 50. Setting it to `0` is
#' worth considering where boards are shared, since the file otherwise
#' carries whatever was typed into every thread; at `0` the chat is not
#' read at save time either, not read and then discarded. It describes
#' the deployment rather than the board, so it is neither a constructor
#' argument nor part of `state` -- restore reads whatever the file
#' holds.
#'
#' Turns go in as they stand because blockr.core writes board files
#' with typedjson, which carries what plain JSON cannot. A board
#' holding anything else under `history` opens without its
#' conversation rather than on a guess at one. The raw provider
#' response is stripped before saving, and a thread trimmed to the
#' budget is cut between exchanges rather than inside one, so it never
#' opens on half of a tool call. A thread reaches `state` once
#' shinychat has recorded it, which is once the model has answered, so
#' a question typed but not yet answered when the board is saved is not
#' in the file.
#'
#' Which thread is open is remembered by the browser rather than in
#' `state`, so a board reopened elsewhere lists its threads without
#' selecting one.
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
#' with the model, which is itself swappable at runtime. It defaults to
#' `Inf`, which leaves compaction **off**: a threshold that would suit
#' one provider's context window is wrong for another's, and nothing in
#' the API reports that window, so a number picked here would be a
#' guess -- silently inert on a small-context model and needlessly
#' destructive on a large one. A deployment that knows its models sets
#' the starting point through the `blockr.chat_compact_tokens` option
#' or the `BLOCKR_CHAT_COMPACT_TOKENS` environment variable, and a user
#' can pick a value for their own session. Contrast
#' [`chat_save_turns`][new_assistant_extension], which stays a
#' deployment setting because it governs whether conversations may land
#' in a shared file at all -- not a decision to hand to the person
#' whose conversation it is.
#'
#' How much survives a compaction is the companion board option,
#' `chat_compact_keep` (deployment default `blockr.chat_compact_keep`,
#' 8): the count of most recent turns left verbatim, with everything
#' older becoming the summary. It is offered on doubling rungs to 256,
#' since a turn count needs no `Inf` and stops meaning much at the top
#' -- keeping 256 turns verbatim is already barely compacting. The
#' figure is a preference rather than a floor: a conversation that
#' exceeds the threshold in fewer turns than this is still compacted,
#' or the bound would be inert exactly where it is needed.
#'
#' Compaction rewrites the browser transcript to match, which is what
#' keeps the two honest. `shinychat` appends each turn to the DOM as it
#' arrives and never reads the client back, so turns dropped from the
#' client would otherwise stay on screen unremembered. The same replay
#' fills in a transcript that a board saved before threads existed
#' leaves empty; tool traffic carries no text and is not replayed.
#'
#' Conversation size is reachable from the chat's command palette,
#' which lists one built-in command alongside the user-invocable
#' skills. The `/compact` command runs the same summarise-and-replace
#' on demand, without waiting for the threshold -- for a thread that
#' has gone stale rather than large, where a long build has finished
#' and the next question is unrelated to it. Opening a fresh thread is
#' the history drawer's own affordance rather than a command, because
#' nothing in `shinychat`'s server API starts one: a command that
#' emptied the transcript would leave the stored thread behind for the
#' next response to extend.
#'
#' @param system_prompt Either a function (called each refresh with
#'   `(board, client, ...)` to build the prompt) or a character
#'   scalar (used verbatim, no refresh). Defaults to the
#'   exported [default_system_prompt] function.
#' @param threads Optional named list of conversation records to seed
#'   the history with, keyed by conversation id. Defaults to no threads.
#'   This is how a restored board seeds the chats it was saved with.
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
                                    threads = NULL,
                                    ...) {
  new_dock_extension(
    server = asst_ext_srv(system_prompt, threads),
    ui = asst_ext_ui,
    name = "Assistant",
    class = "assistant_extension",
    options = new_board_options(
      new_llm_model_option(),
      new_chat_compact_option(),
      new_chat_keep_option()
    ),
    ...
  )
}

asst_ext_ui <- function(id, board, ...) {
  tagList(
    asst_ext_styles(),
    asst_skin_styles(),
    div(
      class = "asst-panel",
      div(
        class = "asst-chat-slot",
        shinychat::chat_ui(
          NS(id, "chat"),
          placeholder = "Ask about your board"
        )
      ),
      div(
        class = "asst-footer",
        uiOutput(NS(id, "focus_picker"), container = function(...) {
          div(class = "asst-focus-slot", ...)
        }),
        uiOutput(NS(id, "tokens"), container = function(...) {
          div(class = "asst-token-slot", ...)
        }),
        asst_history_button()
      )
    )
  )
}

# React binds the trigger's click at the `shiny-chat-container` root and
# re-renders the button, so the node cannot be moved into the footer -- this
# one forwards to it instead, and the original stays in the DOM, hidden.
asst_history_button <- function() {
  tags$button(
    class = "asst-history-btn",
    type = "button",
    title = "Conversation history",
    `aria-label` = "Conversation history",
    onclick = paste0(
      "this.closest('.asst-panel')",
      ".querySelector('.shiny-chat-history-trigger').click()"
    ),
    bsicons::bs_icon("clock-history")
  )
}

asst_focus_select <- function(id, board, blk_ids, selected) {
  board_block_select(
    id,
    board,
    blk_ids,
    selected = selected,
    max_items = NULL,
    options = list(
      placeholder = "Focus on block(s)...",
      plugins = list("remove_button"),
      dropdownParent = "body",
      onDropdownOpen = I(js_focus_dropdown_flip())
    )
  )
}

# Every other board-block picker sits near the top of its container, so
# selectize's downward-only placement suits it. This one is pinned to the
# bottom edge of a full-height panel, where opening downward puts the menu
# below the fold. A body-parented dropdown carries a JS-set `top`, so the
# lift cannot be done in CSS -- it has to run after selectize positions, and
# again on its own whenever the menu changes height, since the menu has none
# until a frame after it opens and grows and shrinks as a search narrows it.
js_focus_dropdown_flip <- function() {
  "function($dropdown) {
     if (this.focusLift) return;
     this.focusLift = true;

     var self = this;
     var menu = $dropdown[0];

     var lift = function() {
       var box = self.$control[0].getBoundingClientRect();
       var height = menu.offsetHeight;

       if (height > 0 && box.bottom + height > window.innerHeight &&
           box.top - height > 0) {
         menu.style.top = (window.scrollY + box.top - height) + 'px';
       }
     };

     var position = self.positionDropdown.bind(self);

     self.positionDropdown = function() {
       position();
       lift();
     };

     new ResizeObserver(lift).observe(menu);
   }"
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
      .asst-chat-slot {
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .asst-panel {
        container-type: inline-size;
      }
      .asst-chat-slot shiny-chat-container {
        flex: 1 1 0;
        min-height: 0;
      }
      /* Sits under the chat container, aligned to the composer: shinychat
         insets its own column by --shiny-chat-fill-padding, so the footer
         has to carry the same inset for the picker's left edge and the
         meter's right edge to land on the composer's. */
      .asst-footer {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 0 0 auto;
        width: min(680px, 100%);
        margin: 0 auto;
        padding: 8px var(--shiny-chat-fill-padding, 0.25rem) 0;
      }
      /* Shiny styles a non-empty uiOutput div `display: contents`, under
         which the flexing below would be inert, so it is overridden here
         the way the token slot below overrides it with `display: flex`. */
      .asst-focus-slot.shiny-html-output {
        display: block;
        flex: 1 1 auto;
        min-width: 0;
      }
      /* Shiny gives every input container a 300px default width, which
         would leave the picker a third of the strip it shares. */
      .asst-focus-slot .shiny-input-container {
        width: 100%;
        margin-bottom: 0;
      }
      /* The footer is flex:0 0 auto against a flex:1 1 0 transcript, so an
         unbounded multi-select would grow into the chat as selections pile
         up. Two rows of chips, then scroll. */
      .asst-focus-slot .selectize-input {
        max-height: 84px;
        overflow-y: auto;
        gap: 3px;
      }
      /* Selectize spaces stacked chips with a bottom margin on each, which
         in this centred flex box reads as the chip sitting high. Carry the
         row spacing on the container's gap instead. The selector matches
         selectize's own `.selectize-control.multi` specificity, or its
         margin wins. */
      .asst-focus-slot .selectize-control.multi .selectize-input > div {
        margin: 0;
      }
      .asst-token-slot.shiny-html-output {
        display: flex;
        justify-content: flex-end;
        flex: 0 0 auto;
        min-height: 15px;
      }
      .asst-meta {
        display: inline-flex;
        align-items: center;
        gap: 14px;
        font-size: 11px;
        line-height: 1;
        color: var(--blockr-color-text-subtle, #9ca3af);
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
        color: var(--blockr-color-text-secondary, #374151);
      }
      .asst-meta-item svg {
        width: 12px;
        height: 12px;
        opacity: 0.75;
      }
      .asst-meta-num {
        font-weight: 500;
      }
      /* shinychat floats its history trigger over the top-left of the
         transcript, where it reads as loose in the prose. The footer control
         replaces it: hidden here, the original still owns the drawer, and
         `asst_history_button()` forwards to it. */
      .asst-chat-slot .shiny-chat-history-trigger {
        display: none;
      }
      /* The band shinychat reserves at the top of the transcript is for the
         floating button that is no longer painted there. */
      .asst-chat-slot shiny-chat-container[data-inline-controls] {
        --_chat-inline-controls-inset: 0px;
      }
      /* Keyed on the trigger the footer button forwards to, so the footer
         never offers a drawer that is not there -- the presence rule stays
         shinychat's. The `data-inline-controls` attribute this used to read
         is not set by every shinychat build, and where it is missing the
         button stayed hidden while the drawer was there all along. */
      .asst-history-btn {
        display: none;
      }
      .asst-panel:has(.shiny-chat-history-trigger) .asst-history-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: none;
        color: var(--blockr-color-text-subtle, #9ca3af);
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .asst-history-btn:hover {
        background: var(--blockr-color-bg-hover, #f3f4f6);
        color: var(--blockr-color-text-secondary, #374151);
      }
      .asst-history-btn:focus-visible {
        outline: none;
        box-shadow:
          var(--blockr-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.12));
      }
      .asst-history-btn svg {
        width: 13px;
        height: 13px;
      }
      /* A collapsed dock panel is a ~30px sliver, and the chat keeps
         painting into it: a transcript one character wide. Blank the panel
         rather than leave a smear of itself. The threshold sits well below
         any panel a chat is readable in, so narrowing one still gives a
         cramped chat rather than nothing. Last in the sheet because it
         overrides the display the slots are given above. */
      @container (max-width: 140px) {
        .asst-chat-slot,
        .asst-footer {
          display: none;
        }
      }
      "
    )
  )
}

asst_ext_srv <- function(system_prompt, threads = NULL) {

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
        added          <- reactiveVal(character())

        report <- reactiveValues(
          count     = 0L,
          seq       = 0L,
          nudge     = NULL,
          awaiting  = FALSE,
          injecting = FALSE
        )

        max_nudges <- 3L

        # The in-flight commit's state, bundled so only these methods touch it:
        # perform_commit arms the bridge with the pre-flush baseline, the blocks
        # the payload claims and the promise resolver; the board$last_update
        # observer settles it a turn later. The generation fences a resolved
        # commit's stale timeout off a subsequent commit.
        commit_bridge <- local({

          resolve  <- NULL
          baseline <- NULL
          claimed  <- character()
          gen      <- 0L

          list(
            arm = function(conditions, claim, resolver) {
              baseline <<- conditions
              claimed  <<- claim
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
            claimed    = function() claimed,
            drop_claim = function() {
              held <- claimed
              claimed <<- character()
              held
            },
            is_current = function(g) identical(g, gen)
          )
        })

        client_r <- reactiveVal(NULL)
        pool_r   <- reactiveVal(NULL)
        mod_r    <- reactiveVal(NULL)

        thread_store <- new_thread_store(
          coal(threads, list(), fail_all = FALSE)
        )

        chat_ctor_r <- reactive(
          get_board_option_value("llm_model", session)
        )

        make_client <- function(ctor, seed_turns) {

          cl <- ctor(system_prompt = "")

          pool <- new_block_tool_pool(cl, board, pending_update, session)

          register_read_tools(cl, board, update, session, pool)
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

          annotate_tool_titles(cl)

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

          list(client = cl, pool = pool)
        }

        # When the chat constructor changes (initial build or after a
        # user-driven option swap), build a fresh client and migrate the
        # prior conversation onto it. The whole build is wrapped: if the
        # chat ctor errors (bad API key check, provider construction
        # failure) we surface the error to the user rather than letting
        # the observer propagate it.
        #
        # A swap hands the new client to the mounted module rather than
        # remounting it. Remounting would render a fresh chat element, and
        # the conversation store partitions on that element's id, so every
        # thread recorded before the swap would be stranded under the old
        # one. Turns are carried here already and the tools belong to the
        # client they were registered against, so the hand-over does not sync.
        observe({

          ctor <- chat_ctor_r()

          seed_turns <- isolate({
            prev <- client_r()
            if (is.null(prev)) list() else prev$get_turns()
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

          client_r(new_client$client)
          pool_r(new_client$pool)

          mod <- isolate(mod_r())

          if (!is.null(mod)) {
            mod$set_client(new_client$client, sync = FALSE)
          }
        })

        # Mounted once, against the first client that builds. The store keeps
        # every thread for this board and rides into board state at save time,
        # so `max_store_mb` is left off: the save budget is what bounds the
        # file, and evicting a thread the user is still reading would be a
        # surprise. Our store ignores the partition -- one store serves one
        # board -- so `scope` only has to be a constant the history controller
        # can resolve without waiting on an authenticated user.
        observeEvent(
          client_r(),
          {
            # Resolving the greeting is shinychat's only public signal that a
            # fresh thread has opened: it fires on the initial settle when
            # nothing was restored, and again on every new conversation.
            # Changes staged but never committed belong to the thread they
            # were staged in, so they go when it does.
            mod <- shinychat::chat_server(
              "chat", isolate(client_r()),
              greeting = function() {
                restore_thread_state(list())
                reset_staging()
                asst_greeting(board)
              },
              history = shinychat::history_options(
                store = thread_store,
                scope = "board",
                max_store_mb = NULL
              )
            )

            # Focus is per conversation: a switch that leaves it pointing at
            # the thread the user just left is worse than not switching at
            # all. The list round trip is deliberate -- board state carries
            # `values` as plain JSON, which returns a character vector as a
            # list, so saving one keeps both paths the same shape.
            mod$history$on_save(
              function(values) {
                values[["focus"]] <- as.list(isolate(focus_r()))
                values[["spent"]] <- as.list(isolate(spent()))
                values
              }
            )

            mod$history$on_restore(
              function(values) {
                restore_thread_state(values)
                reset_staging()
                maybe_compact()
              }
            )

            # Advertising the slash commands is a one-shot push to the chat
            # element, so it has to wait for the flush that carries that
            # element's UI: registering in-line here sends it a flush early,
            # and the browser drops what it cannot yet address.
            #
            # The built-ins go first so that a deployment skill named after
            # one of them is the registration that collides and is logged,
            # rather than the one that silently takes the name.
            session$onFlushed(
              function() {
                register_builtin_commands(
                  mod, compact_conversation, clear_conversation
                )
                register_skill_commands(mod, run_skill_command)
              },
              once = TRUE
            )

            mod_r(mod)
          },
          once = TRUE
        )

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

        compact_conversation <- function() {

          cl  <- isolate(client_r())
          mod <- isolate(mod_r())

          if (is.null(cl) || is.null(mod)) {
            return(invisible())
          }

          turns <- cl$get_turns()
          keep  <- isolate(compaction_keep_turns(session))
          split <- compaction_split(turns, keep)

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

        # The drawer's New button, reachable from the palette. It saves the
        # thread on screen, empties the transcript and the turns the model is
        # sent, and drops the active record so the next answer opens a thread
        # of its own -- the conversation is reset without the one on screen
        # being overwritten by what comes next. The controller is not on
        # `mod$history`, which carries `on_save`/`on_restore` and nothing
        # else, so it is read from where shinychat parks it. Where that lookup
        # misses, emptying both copies of the conversation is still better
        # than a command that does nothing.
        clear_conversation <- function() {

          mod <- isolate(mod_r())

          if (is.null(mod)) {
            return(invisible())
          }

          ctrl <- history_controller(session)

          if (is.null(ctrl)) {
            mod$clear(greeting = TRUE, client_history = "clear")
            reset_staging()
            return(invisible())
          }

          ctrl$new_chat()

          # `new_chat()` empties the conversation without resolving a
          # greeting, so the callback that carries the per-thread state does
          # not run here: the focus pick and the token meter would survive
          # into a thread they say nothing about. Both are what a fresh thread
          # opens on, and a greeting that does fire later sets the same
          # values.
          restore_thread_state(list())
          reset_staging()

          invisible()
        }

        maybe_compact <- function() {

          cl <- isolate(client_r())

          if (is.null(cl)) {
            return(invisible())
          }

          # Isolated because the threshold is read at the moment a turn ends,
          # not depended on: the mount observer calls this, and a dependency
          # would replay the whole transcript every time the user retunes it.
          bound <- isolate(chat_compact_tokens(session))

          if (over_context_bound(cl$get_turns(), bound)) {
            compact_conversation()
          }

          invisible()
        }

        # Keyed on what the picker actually shows rather than on the board,
        # so a commit that touches neither the block set nor a block name
        # leaves an open dropdown and a half-typed search alone.
        focus_choices <- reactiveVal()

        observe({
          blks <- board_blocks(board$board)
          focus_choices(set_names(chr_ply(blks, block_name), names(blks)))
        })

        focus_r <- reactive(
          intersect(input$focus, board_block_ids(board$board))
        )

        output$focus_picker <- renderUI({

          blk_ids <- names(focus_choices())

          if (!length(blk_ids)) {
            return(NULL)
          }

          asst_focus_select(
            session$ns("focus"), isolate(board$board), blk_ids,
            isolate(focus_r())
          )
        })

        refresh_prompt <- function() {

          cl <- client_r()
          if (is.null(cl)) return(invisible())

          prompt <- tryCatch(
            compose(
              board, cl, view_data = view_data, skills = skill_catalogue(),
              focus = focus_r()
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
          focus_r()
          refresh_prompt()
        })

        last_input_r <- reactive(req(mod_r())$last_input())
        last_turn_r  <- reactive(req(mod_r())$last_turn())

        # What the conversation has cost so far, not what the last exchange
        # did: the meter belongs to the thread, so it is carried in the
        # thread's saved values, restored with it and reset when a fresh one
        # opens. Accumulated rather than summed over the client's turns, which
        # compaction and the save budget both shorten.
        spent <- reactiveVal(c(0L, 0L))

        account_turn <- function(turn) {

          toks <- turn@tokens

          spent(
            isolate(spent()) + c(
              if (is.na(toks[1])) 0L else as.integer(toks[1]),
              if (is.na(toks[2])) 0L else as.integer(toks[2])
            )
          )

          invisible()
        }

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

              upd <- isolate(update())

              touched(
                union(
                  isolate(touched()),
                  touched_blocks(upd, isolate(board$board))
                )
              )

              added(union(isolate(added()), added_blocks(upd)))
            }
          }
        )

        flush_review <- function(baseline, header) {

          format_flush_feedback(
            list(ok = TRUE),
            added_conditions(baseline, isolate(board$conditions())),
            collect_touched_results(
              isolate(touched()), board, isolate(added())
            ),
            header = header
          )
        }

        # Take the review once the blocks the commit claimed have run -- NOT on
        # the flush that applies the update, which is what this replaces. Dock
        # reports visibility from the client, so a block the model changed on a
        # tab nobody is looking at needs several reactive cycles under its claim
        # before it reaches a status worth reading. Reviewed at that first
        # flush, every one of them still said `dormant`, the model was told
        # `dormant` is "not a failure", and a block whose script raised came
        # back as "no problems to report".
        #
        # An observer rather than a poll, so the wait advances with the reactive
        # graph rather than racing it, and it destroys itself as it settles. The
        # commit timeout stays the backstop: a claim that never settles resolves
        # there, and settle_commit() is a no-op the second time round.
        await_commit_review <- function(claimed) {

          wait <- observe({

            if (!commit_settled(claimed, board)) {
              return()
            }

            review <- flush_review(commit_bridge$baseline(), commit_header())

            settle_commit(coal(review, commit_clean_note(), fail_all = FALSE))

            wait$destroy()
          })

          invisible(wait)
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
          added(character())
          report$awaiting <- TRUE

          # Read off the staged payload, not off `touched()`: that reactiveVal
          # is filled by the update() observer, which runs after the flush this
          # claim has to ride in on.
          claim <- commit_claim_ids(
            isolate(pending_update()), isolate(board$board)
          )

          promises::promise(
            function(resolve, reject) {

              gen <- commit_bridge$arm(
                isolate(board$conditions()), claim, resolve
              )

              later::later(
                function() {
                  if (commit_bridge$is_current(gen)) {
                    settle_commit(commit_timeout_note())
                  }
                },
                delay = commit_timeout_secs()
              )

              flush_pending(pending_update, update, claim)
            }
          )
        }

        # Release the claim the last commit took. Held past the review on
        # purpose -- a follow-up get_block_result on the block the model just
        # built would otherwise answer `dormant` -- so the turn ending is what
        # lets the board go back to evaluating only what is on screen. Each
        # commit's claim states the owner's whole set, so it replaces rather
        # than adds to this one in between.
        release_commit_claim <- function() {

          if (length(commit_bridge$drop_claim())) {
            update(list(sustain = commit_claim_delta(character())))
          }

          invisible()
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

        # Both of these belong to the conversation rather than the board, so a
        # switch carries them over and a fresh thread opens without them. An
        # absent value is the fresh case: no focus, nothing spent.
        restore_thread_state <- function(values) {

          focus <- unlst(values[["focus"]])
          meter <- unlst(values[["spent"]])

          updateSelectizeInput(
            session, "focus",
            selected = if (length(focus)) as.character(focus) else character()
          )

          spent(if (length(meter) == 2L) as.integer(meter) else c(0L, 0L))

          invisible()
        }

        reset_staging <- function() {

          report$count <- 0L
          reset_pending(pending_update)
          touched(character())
          added(character())

          invisible()
        }

        # A fresh user turn resets the staging slate -- but our own injected
        # nudge arrives as a synthetic user turn too, and must not wipe the
        # pending it is asking the model to resolve.
        on_user_input <- function() {

          pool <- isolate(pool_r())

          if (!is.null(pool)) {
            pool$new_turn()
          }

          if (isolate(report$injecting)) {
            report$injecting <- FALSE
          } else {
            reset_staging()
          }
        }

        on_model_turn <- function(turn) {

          account_turn(turn)

          release_commit_claim()

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
                format_flush_feedback(
                  outcome,
                  header = commit_reject_header(outcome$phase)
                )
              )
              return()
            }

            await_commit_review(commit_bridge$claimed())
          },
          ignoreNULL = TRUE
        )

        output$tokens <- renderUI(
          format_token_telemetry(spent())
        )

        # Resolved by the board's serializer at save time, so the budget and
        # the threads are both read as they stand then.
        #
        # `chat_save_turns` is asked FIRST and nothing else runs at 0. It is
        # the deployment's answer to whether conversations may land in a
        # shared file at all, so a deployment that said no should not have
        # the chat read at save time, let alone written.
        #
        # There is no flush of the live thread here. shinychat's module
        # object carries `on_save` and `on_restore` on `mod$history` and
        # nothing else -- the environment is locked, and `save_current()`
        # lives on the history controller behind it, not on the module. The
        # `mod$history$save()` this used to call was therefore NULL, and
        # since the call head is an expression rather than a symbol, every
        # board save aborted on "attempt to apply non-function" from the
        # first flush of any session that mounted the chat.
        #
        # `test-ext-server.R` reported that abort on four state tests and
        # it stood, because the message names nothing and the same run
        # carries unrelated failures from whatever ellmer and blockr.core
        # the box has. What made it survivable was the other half: tests
        # that mock the module used a double carrying a `save()` of its own
        # invention, and one of them asserted the call.
        #
        # What that costs: an exchange the store has not recorded yet is not
        # written. shinychat records a thread once the model answers, so this
        # is the question typed but not yet answered when the save happens.
        state_payload <- list(
          history = function() {
            isolate({

              save_turns <- chat_save_turns()

              if (save_turns <= 0) {
                return(NULL)
              }

              serialize_chat_threads(
                thread_store,
                save_turns,
                client_turns(client_r())
              )
            })
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

# `keep` leaves the client alone -- the turns are set by the caller, which is
# the point: this is what stops the transcript and the model's memory drifting
# apart. Tool traffic carries no text and is not replayed.
replay_transcript <- function(mod, turns) {

  mod$clear(client_history = "keep")

  for (turn in shown_turns(turns)) {
    mod$append(turn_text(turn), role = turn@role)
  }

  invisible()
}

# What a transcript shows: the turns the user typed and the model's prose.
# Tool traffic carries no text, and neither does an assistant turn that only
# requested one.
shown_turns <- function(turns) {

  Filter(
    function(turn) {
      turn@role %in% c("user", "assistant") && nzchar(turn_text(turn))
    },
    turns
  )
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

# Rendered even before a turn has reported, as zeros. The meter shares its
# row with the focus picker, so letting it appear only once it has numbers
# would resize the picker out from under the user mid-conversation.
format_token_telemetry <- function(spent) {

  in_t  <- spent[[1L]]
  out_t <- spent[[2L]]

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
      glue::glue("Input tokens (this conversation): {in_t}")
    ),
    meta_item(
      "arrow-down-short", out_t,
      glue::glue("Output tokens (this conversation): {out_t}")
    )
  )
}
