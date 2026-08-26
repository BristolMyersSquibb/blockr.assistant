# Visual skin for the assistant chat panel.
#
# shinychat stays vanilla: everything here is either (a) content passed
# through shinychat's documented API (the greeting), (b) a value for one of
# its `--shiny-chat-*` custom properties, or (c) a CSS overlay on its public
# class names. Only the two footer properties are documented in shinychat's
# reference; the rest are public by its own prefix convention, where `--_`
# marks the private ones. If a shinychat update changes markup under (c), the
# affected rule stops matching and that piece falls back to shinychat's
# default look -- the panel degrades, it does not break. All selectors are
# scoped under `.asst-panel` so none of this leaks into other chat UIs on the
# page.
#
# The tool rows are the volatile part of shinychat's markup: the card stack
# these classes replaced was itself only one release old. Verified against
# shinychat main, which is what this package's `Remotes:` pins.
#
# The design targets the blockr design system (blockr.docs/design-system):
# greyscale palette, 8px radii on inputs and cards, the 42/30/26/24px
# height ladder, a single focus ring, hover transitions at 0.15s, no
# shadows. Tokens are referenced with literal fallbacks so the panel
# renders sensibly when the `--blockr-*` sheet is absent.

asst_greeting <- function() {
  shinychat::chat_greeting(
    paste0(
      "### What should this board do?\n\n",
      "I can read, build and rearrange blocks on it\n\n",
      "- <span class=\"suggestion\">Summarize what this board does</span>\n",
      "- <span class=\"suggestion\">Add a chart for the data ",
      "I am looking at</span>\n",
      "- <span class=\"suggestion\">Check the pipeline for problems</span>\n"
    )
  )
}

# Tool rows title from `annotations$title` (shinychat renders it in place of
# the bare function name). Rather than repeating a title at ~35
# `ellmer::tool()` definitions, derive it from the name: `list_blocks` ->
# "List blocks". A tool that carries its own title keeps it.
annotate_tool_title <- function(tool) {

  if (!is.null(tool@annotations$title)) {
    return(tool)
  }

  nm <- gsub("_", " ", tool@name, fixed = TRUE)

  tool@annotations$title <- paste0(
    toupper(substring(nm, 1L, 1L)),
    substring(nm, 2L)
  )

  tool
}

annotate_tool_titles <- function(client) {

  client$set_tools(lapply(client$get_tools(), annotate_tool_title))

  invisible(client)
}

asst_skin_styles <- function() {
  tags$style(
    HTML(
      "
      /* ---- tokens ---------------------------------------------------- */
      .asst-panel shiny-chat-container {
        --shiny-chat-border: 1px solid var(--blockr-color-border, #e5e7eb);
        --shiny-chat-user-message-bg: var(--blockr-color-bg-input, #f9fafb);
        --shiny-chat-greeting-color: var(--blockr-color-text-muted, #6b7280);
        --shiny-chat-streaming-color:
          var(--blockr-grey-400, #9ca3af),
          var(--blockr-grey-500, #6b7280),
          var(--blockr-grey-700, #374151);
        --shiny-tool-card-spinner-color:
          var(--blockr-color-text-muted, #6b7280);
        font-size: 14px;
      }
      /* shinychat declares these on the thinking block itself, so a value
         inherited from the container is shadowed */
      .asst-panel .shiny-chat-thinking {
        --shiny-chat-thinking-border-color:
          var(--blockr-color-border, #e5e7eb);
        --shiny-chat-thinking-content-color:
          var(--blockr-color-text-muted, #6b7280);
        --shiny-chat-thinking-header-color:
          var(--blockr-color-text-secondary, #374151);
      }

      /* ---- no avatar column: assistant turns are plain prose -------- */
      .asst-panel .shiny-chat-message {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
      }
      .asst-panel .shiny-chat-message .message-icon {
        display: none;
      }

      /* ---- user turn: full-width band with a 'You' label ------------ */
      .asst-panel .shiny-chat-user-message {
        align-self: stretch;
        max-width: 100%;
        border-radius: 8px;
        padding: 7px 12px;
        font-size: 13.5px;
      }
      .asst-panel .shiny-chat-user-message::before {
        content: 'You';
        display: block;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.4;
        color: var(--blockr-color-text-subtle, #9ca3af);
      }

      /* ---- greeting + suggestions: 30px rows, not cards -------------- */
      .asst-panel .shiny-chat-greeting {
        padding: 24px 2px 2px;
      }
      .asst-panel .shiny-chat-greeting h3 {
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 2px;
        color: var(--blockr-color-text-primary, #111827);
      }
      .asst-panel .shiny-chat-greeting p {
        margin: 0;
        font-size: 13px;
      }
      .asst-panel shiny-chat-container .shiny-chat-suggestion-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-block: 12px 0;
      }
      .asst-panel shiny-chat-container .shiny-chat-suggestion-list
        .shiny-chat-suggestion-list-item {
        display: flex;
        align-items: center;
        min-height: 30px;
        padding: 2px 10px;
        border: none;
        border-radius: 8px;
        background: var(--blockr-color-bg-input, #f9fafb);
        font-size: 13px;
        color: var(--blockr-color-text-secondary, #374151);
        transition: background 0.15s ease;
        transform: none;
        box-shadow: none;
      }
      .asst-panel shiny-chat-container .shiny-chat-suggestion-list
        .shiny-chat-suggestion-list-item:hover {
        background: var(--blockr-color-bg-hover, #f3f4f6);
        border-color: transparent;
        transform: none;
        box-shadow: none;
      }
      .asst-panel shiny-chat-container .shiny-chat-suggestion-list
        .shiny-chat-suggestion-list-item::after {
        display: none;
      }

      /* ---- tool calls: shinychat's activity rows on the ladder ------- */
      .asst-panel .shiny-chat-tool-loop {
        margin: 6px 0;
      }
      .asst-panel :is(.shiny-chat-tool-group__row,
                      .shiny-chat-tool-call-row__summary) {
        min-height: 30px;
        padding: 2px 10px;
        border-radius: 8px;
        font-size: 12px;
        color: var(--blockr-color-text-muted, #6b7280);
        transition: background 0.15s ease;
      }
      .asst-panel :is(.shiny-chat-tool-group__row,
                      .shiny-chat-tool-call-row__summary):hover {
        background: var(--blockr-color-bg-hover, #f3f4f6);
      }
      .asst-panel :is(.shiny-chat-tool-group__row,
                      .shiny-chat-tool-call-row__summary):focus-visible {
        outline: none;
        box-shadow:
          var(--blockr-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.12));
      }
      .asst-panel .shiny-chat-tool-group__title {
        font-weight: 500;
        color: var(--blockr-color-text-secondary, #374151);
      }
      /* a tool with no title falls back to a <code> name, which Bootstrap
         renders in its own accent */
      .asst-panel :is(.shiny-chat-tool-group__toolname,
                      .shiny-chat-tool-call-row__label code) {
        padding: 0;
        background: none;
        font-size: inherit;
        color: inherit;
      }
      .asst-panel :is(.shiny-chat-tool-group__count,
                      .shiny-chat-tool-group__overflow,
                      .shiny-chat-tool-call-row__preview,
                      .shiny-chat-tool-row__intent,
                      .shiny-chat-tool-group__glyph,
                      .shiny-chat-tool-group__chevron,
                      .shiny-chat-tool-call-row__status,
                      .shiny-chat-tool-call-row__chevron) {
        color: var(--blockr-color-text-subtle, #9ca3af);
      }
      .asst-panel .shiny-chat-tool-group__failed {
        color: var(--blockr-color-error, #dc2626);
      }

      /* ---- tool detail: the card behind an expanded row -------------- */
      .asst-panel .shiny-tool-card {
        border: 1px solid var(--blockr-color-border, #e5e7eb);
        border-radius: 8px;
        box-shadow: none;
        margin: 0;
        background: transparent;
      }
      .asst-panel .shiny-tool-card > .card-header {
        background: transparent;
        border: none;
        min-height: 24px;
        padding: 2px 10px;
        font-size: 12px;
        color: var(--blockr-color-text-muted, #6b7280);
        transition: background 0.15s ease;
      }
      .asst-panel .shiny-tool-card > .card-header:hover,
      .asst-panel .shiny-tool-card > .card-header:focus-visible {
        background: var(--blockr-color-bg-subtle, #f9fafb);
      }
      .asst-panel .shiny-tool-card .tool-title-name {
        font-weight: 500;
        color: var(--blockr-color-text-secondary, #374151);
      }
      .asst-panel .shiny-tool-card .tool-intent {
        font-style: normal;
        font-size: 11.5px;
        color: var(--blockr-color-text-subtle, #9ca3af);
      }
      .asst-panel .shiny-tool-card > .card-body {
        font-size: 12px;
        color: var(--blockr-color-text-muted, #6b7280);
        border-top: 1px solid var(--blockr-grey-100, #f3f4f6);
      }

      /* ---- input: the standard blockr text surface ------------------- */
      .asst-panel .shiny-chat-input .tiptap {
        --bs-border-radius: 8px;
        border: 1px solid var(--blockr-color-border, #e5e7eb) !important;
        background: var(--bs-body-bg, #fff);
        font-size: 13.5px;
        min-height: 42px;
        align-content: center;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .asst-panel .shiny-chat-input .tiptap:focus,
      .asst-panel .shiny-chat-input .tiptap:focus-within {
        border-color: var(--blockr-color-primary, #2563eb) !important;
        box-shadow:
          var(--blockr-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.12));
        outline: none;
      }
      .asst-panel .shiny-chat-input .tiptap.is-empty:before {
        color: var(--blockr-color-text-subtle, #9ca3af);
      }
      /* shinychat pins both buttons to the bottom of .shiny-chat-input,
         which is a taller box than the one the text is laid out in, so the
         two only agree at shinychat's own composer height. Anchoring them
         to the text's box keeps them centred as the composer grows. */
      .asst-panel .shiny-chat-input-dropzone {
        position: relative;
      }
      .asst-panel :is(.shiny-chat-btn-send, .shiny-chat-btn-attach) {
        top: 50%;
        bottom: auto;
        transform: translateY(-50%);
      }
      .asst-panel .shiny-chat-btn-send {
        width: 26px;
        height: 26px;
        border-radius: 6px;
        background: var(--blockr-color-primary, #2563eb);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease;
      }
      .asst-panel .shiny-chat-btn-send:hover:not(:disabled) {
        background: var(--blockr-color-primary-hover, #1d4ed8);
        color: #fff;
      }
      .asst-panel .shiny-chat-btn-send:disabled {
        background: var(--blockr-color-bg-hover, #f3f4f6);
        color: var(--blockr-color-text-subtle, #9ca3af);
      }
      .asst-panel .shiny-chat-btn-send.shiny-chat-btn-cancel {
        background: var(--blockr-grey-900, #111827);
        color: #fff;
      }
      .asst-panel .shiny-chat-btn-send svg {
        width: 14px;
        height: 14px;
      }
      .asst-panel .shiny-chat-btn-attach {
        color: var(--blockr-color-text-subtle, #9ca3af);
      }
      .asst-panel .shiny-chat-btn-attach:hover:not(:disabled) {
        color: var(--blockr-color-text-secondary, #374151);
      }
      .asst-panel .shiny-chat-btn-attach svg {
        width: 16px;
        height: 16px;
      }
      "
    )
  )
}
