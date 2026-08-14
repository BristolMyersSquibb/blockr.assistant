chat_compact_tokens <- function(session) {
  validate_compact_tokens(
    get_board_option_value("chat_compact_tokens", session)
  )
}

# A board option rather than a deployment one, because where the threshold
# belongs depends on whose decision it is. `chat_save_turns` governs whether a
# conversation may land in a shared file, which is the deployment's call and
# not the user's to relax. This governs how much history the model keeps within
# one session, which is the user's own trade of recall against how soon the
# chat starts summarising -- and since the model can be swapped at runtime, the
# right value can change mid-session. The deployment still sets where it
# starts, through `blockr.chat_compact_tokens`.
new_chat_compact_option <- function(value = blockr_option("chat_compact_tokens",
                                                          Inf),
                                    category = "Assistant options",
                                    ...) {

  value <- validate_compact_tokens(value)

  new_board_option(
    id = "chat_compact_tokens",
    default = value,
    ui = function(id) {
      selectizeInput(
        NS(id, "chat_compact_tokens"),
        "Compact conversation above",
        choices = compact_token_choices(value),
        selected = compact_token_key(value),
        options = compact_token_opts()
      )
    },
    server = function(..., session) {
      observeEvent(
        get_board_option_or_null("chat_compact_tokens", session),
        {
          val <- get_board_option_value("chat_compact_tokens", session)

          updateSelectizeInput(
            session,
            "chat_compact_tokens",
            choices = compact_token_choices(val),
            selected = compact_token_key(val),
            options = compact_token_opts()
          )
        }
      )
    },
    transform = function(x) compact_tokens_value(x),
    category = category,
    ...
  )
}

# A combobox rather than a plain number field, because `Inf` is a mode and not
# a magnitude: a numeric input cannot carry it, which forces an empty box to
# stand in for "never" and then looks unset rather than deliberately off. The
# ladder doubles as the answer to step size -- nobody cares about 123456 vs
# 123457, and preset spacing that grows with magnitude gives fine granularity
# where values are small without a stepper that has to change its own step.
compact_token_ladder <- function() {
  c(8000, 16000, 32000, 64000, 128000, 200000, 400000, 1000000)
}

combo_opts <- function(pattern) {
  list(create = TRUE, createFilter = I(pattern), persist = FALSE)
}

# Whatever is in force is folded in, so a value set by a deployment or restored
# from a board stays selectable instead of snapping to a neighbour or vanishing.
# Not cosmetic on the slider: `sliderTextInput()` errors outright when
# `selected` is absent from `choices`, and that render happens in the board
# settings panel.
ladder_values <- function(ladder, value) {
  sort(unique(c(ladder, value[is.finite(value)])))
}

combo_choices <- function(ladder, value, label) {

  vals <- ladder_values(ladder, value)

  set_names(as.character(vals), chr_ply(vals, label))
}

compact_token_opts <- function() {
  combo_opts("/^\\s*[0-9]+(\\.[0-9]+)?\\s*[kKmM]?\\s*$/")
}

compact_token_choices <- function(value) {
  c(
    combo_choices(compact_token_ladder(), value, format_token_count),
    Never = "Inf"
  )
}

compact_token_key <- function(x) {
  if (is.finite(x)) as.character(x) else "Inf"
}

format_token_count <- function(x) {

  if (x >= 1e6) {
    return(paste0(format(x / 1e6, trim = TRUE), "M"))
  }

  paste0(format(x / 1e3, trim = TRUE), "k")
}

compact_tokens_value <- function(x) {

  if (!length(x) || all(is.na(x))) {
    return(Inf)
  }

  parse_token_count(x)
}

# The combobox hands back whatever was typed, so "64k" and "1.5M" have to mean
# what they say -- that spelling is the reason to offer free entry at all.
parse_token_count <- function(x) {

  if (is.numeric(x)) {
    return(as.numeric(x))
  }

  x <- trimws(tolower(as.character(x)))

  if (identical(x, "inf")) {
    return(Inf)
  }

  scale <- c(k = 1e3, m = 1e6)
  unit <- substring(x, nchar(x))

  if (unit %in% names(scale)) {
    x <- substring(x, 1L, nchar(x) - 1L)
    return(suppressWarnings(as.numeric(trimws(x))) * scale[[unit]])
  }

  suppressWarnings(as.numeric(x))
}

validate_compact_tokens <- function(x) {

  # JSON has no infinity, so a board saved with compaction switched off brings
  # `Inf` back as the string "Inf" -- and the combobox hands back whatever was
  # typed, "64k" included. Coerce rather than reject: refusing here would abort
  # inside a board-server observer on restore, which is how #97 took whole
  # boards down. Anything that is not a number still fails below, via NA.
  if (is.character(x) && is_scalar(x)) {
    x <- parse_token_count(x)
  }

  if (!is_whole_bound(x, 1)) {
    blockr_abort(
      "Expecting `chat_compact_tokens` to be a positive whole number, or ",
      "`Inf` to switch compaction off. It is the size a request may reach ",
      "before the conversation is compacted, so `0` is not a way to disable ",
      "it.",
      class = "invalid_compact_tokens"
    )
  }

  x
}

compaction_keep_turns <- function(session) {
  validate_compact_keep(
    get_board_option_value("chat_compact_keep", session)
  )
}

# A slider here, where the threshold takes a combobox, because the constraints
# differ rather than out of inconsistency: there is no sentinel to express, and
# the quantity runs out of meaning at the top -- keeping 256 turns verbatim is
# already barely compacting, so a ceiling costs nothing, where a ceiling on the
# token threshold would rule out real context windows. Doubling rungs give the
# finer steps at the small end that matter (2 against 4 verbatim turns is a
# real difference, 128 against 130 is not) and nobody needs 10 while 8 and 16
# are both on offer.
compact_keep_ladder <- function() {
  c(0, 2, 4, 8, 16, 32, 64, 128, 256)
}

new_chat_keep_option <- function(value = blockr_option("chat_compact_keep", 8L),
                                 category = "Assistant options",
                                 ...) {

  value <- validate_compact_keep(value)

  new_board_option(
    id = "chat_compact_keep",
    default = value,
    ui = function(id) {
      shinyWidgets::sliderTextInput(
        NS(id, "chat_compact_keep"),
        "Turns kept verbatim when compacting",
        choices = compact_keep_choices(value),
        selected = as.character(value),
        grid = TRUE,
        post = " turns"
      )
    },
    server = function(..., session) {
      observeEvent(
        get_board_option_or_null("chat_compact_keep", session),
        {
          val <- get_board_option_value("chat_compact_keep", session)

          shinyWidgets::updateSliderTextInput(
            session,
            "chat_compact_keep",
            choices = compact_keep_choices(val),
            selected = as.character(val)
          )
        }
      )
    },
    transform = function(x) compact_keep_value(x),
    category = category,
    ...
  )
}

compact_keep_choices <- function(value) {
  as.character(ladder_values(compact_keep_ladder(), value))
}

# The slider hands back the rung as text. Falling back to the default rather
# than erroring on an empty one matters because `compaction_keep_turns()` is
# read from inside an observer, where an abort would take the session down.
compact_keep_value <- function(x) {

  if (!length(x) || all(is.na(x)) || !any(nzchar(as.character(x)))) {
    return(8L)
  }

  as.integer(suppressWarnings(as.numeric(x)))
}

validate_compact_keep <- function(x) {

  if (is.character(x) && is_scalar(x)) {
    x <- suppressWarnings(as.numeric(x))
  }

  if (!is_whole_bound(x, 0) || is.infinite(x)) {
    blockr_abort(
      "Expecting `chat_compact_keep` to be a whole number of turns, `0` to ",
      "keep none verbatim. Compaction is switched off through ",
      "`chat_compact_tokens`, not here.",
      class = "invalid_compact_keep"
    )
  }

  as.integer(x)
}

# The provider's own accounting of the last request, plus what it wrote back:
# together, the floor for what the next request will carry. Turns restored from
# a saved board keep their counts, so this reads a reopened conversation too.
#
# Every slot counts. ellmer packs c(input, output, cached_input), and for
# Anthropic -- whose `cache` argument defaults to "5m", so this is the ordinary
# case, not a corner -- the conversation prefix migrates into `cached_input` as
# the cache warms, leaving `input` holding little more than the newest turn.
# Summing only input and output therefore reads a small, near-flat number that
# never crosses the bound, which would leave the long session this exists to
# bound entirely unbounded.
context_tokens <- function(turns) {

  for (turn in rev(turns)) {

    if (!identical(turn@role, "assistant")) {
      next
    }

    toks <- turn@tokens

    if (length(toks) && !all(is.na(toks))) {
      return(sum(toks, na.rm = TRUE))
    }
  }

  NA_real_
}

over_context_bound <- function(turns, limit) {

  toks <- context_tokens(turns)

  !is.na(toks) && toks > limit
}

# The kept window has to open on a user turn: a tool result whose request was
# summarised away is rejected by every provider, and the handover below closes
# on a user turn, which cannot be followed by another. Widening forwards rather
# than back keeps each compaction a strict reduction, so a conversation whose
# tail is one long tool sequence still makes progress.
compaction_split <- function(turns, keep) {

  n <- length(turns)

  if (n < 2L) {
    return(NULL)
  }

  # `keep` is a preference, not a floor. This is only reached once the
  # conversation is already over the bound, so there is no such thing as too
  # short to bother: a single large tool result can exceed a context window in
  # a couple of turns, and honouring `keep` there would decline to compact the
  # very conversation that is about to be rejected. Keep at most what still
  # leaves an exchange to summarise.
  cut <- n - min(keep, n - 2L)

  while (cut < n && !identical(turns[[cut + 1L]]@role, "user")) {
    cut <- cut + 1L
  }

  list(
    summarise = turns[seq_len(cut)],
    keep = if (cut < n) turns[seq.int(cut + 1L, n)] else list()
  )
}

compaction_request <- function() {
  paste(
    "Summarise our conversation so far so we can carry on with less of it in",
    "context. Cover what I asked for and why, what you changed on the board",
    "and under which ids, what you learned about the data, and anything left",
    "open. Write it as notes to yourself, not a report to me."
  )
}

# The handover is stored as the exchange it actually was -- our request, the
# model's answer -- so the client and the transcript can show the same thing
# and role alternation survives whatever the kept window opens with.
compacted_turns <- function(summary, kept) {
  c(
    list(
      Turn("user", compaction_request()),
      Turn("assistant", summary)
    ),
    kept
  )
}

summarise_turns <- function(client, turns) {
  compaction_client(client, turns)$chat_async(compaction_request())
}

# Summarising is a request like any other, so it goes through a clone: setting
# turns, prompt and tools on the live client would strip the board tools off
# the very thing that is mid-conversation.
compaction_client <- function(client, turns) {

  scratch <- client$clone()

  scratch$set_tools(list())
  scratch$set_system_prompt(compaction_system_prompt())
  scratch$set_turns(turns)

  scratch
}

compaction_system_prompt <- function() {
  paste(
    "You are compacting a conversation between a user and an assistant that",
    "edits a blockr board. Reply with the summary alone -- no preamble, no",
    "sign-off. Preserve concrete identifiers verbatim: block, stack, link and",
    "extension ids, column names, file paths. Prefer losing prose over losing",
    "a detail the assistant would need to keep working."
  )
}
