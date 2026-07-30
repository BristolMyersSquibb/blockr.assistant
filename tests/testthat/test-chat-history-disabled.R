# The extension must mount shinychat with history = FALSE. This is a
# regression guard, not a style check: shinychat's chat_mod_server() defaults
# history = TRUE, so DELETING our argument silently re-enables a persistent
# conversation store that kills the session on restore. See the long comment
# at the mount site in R/extension.R for the mechanism.

test_that("the chat module is mounted with history disabled", {

  src <- paste(deparse(asst_ext_srv), collapse = "\n")

  expect_match(src, "chat_mod_server", fixed = TRUE)
  expect_match(src, "history = FALSE", fixed = TRUE)
})

test_that("ellmer still rejects a JSON-round-tripped recorded turn", {

  # The upstream bug the guard above exists for. ellmer stamps `version` as a
  # double and check_recorded() compares with identical(), so jsonlite handing
  # back an integer aborts the replay -- with a message naming the value 1,
  # which is correct, rather than the type, which is not.
  #
  # When this test starts FAILING, upstream has fixed it (numeric comparison,
  # or a type-preserving reader in the store) and the history = FALSE guard
  # can be reconsidered. Failing here is good news; read the comment in
  # R/extension.R before changing anything.
  recorded <- ellmer::contents_record(ellmer::Turn("user", "hi"))
  expect_type(recorded$version, "double")

  round_tripped <- jsonlite::fromJSON(
    jsonlite::toJSON(recorded, auto_unbox = TRUE, null = "null"),
    simplifyVector = FALSE
  )
  expect_type(round_tripped$version, "integer")

  expect_error(
    ellmer::contents_replay(round_tripped),
    "Unsupported version"
  )
})
