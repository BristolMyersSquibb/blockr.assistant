chat_compact_tokens <- function() {
  validate_compact_tokens(blockr_option("chat_compact_tokens", 50000L))
}

validate_compact_tokens <- function(x) {

  if (!is_whole_bound(x, 1)) {
    blockr_abort(
      "Expecting `chat_compact_tokens` to be a positive whole number or ",
      "`Inf`.",
      class = "invalid_compact_tokens"
    )
  }

  x
}

# Four exchanges: enough that the model still has the thread it was pulling on
# verbatim, few enough that a compaction is worth the call that bought it.
compaction_keep_turns <- function() {
  8L
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
  cut <- n - keep

  if (cut < 1L) {
    return(NULL)
  }

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
