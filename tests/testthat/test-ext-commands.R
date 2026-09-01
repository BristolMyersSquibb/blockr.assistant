test_that("the built-ins register without echoing their invocation", {

  registered <- list()

  mod <- list(
    slash_command = function(name, description, handler, ..., echo = NULL,
                             force = FALSE) {
      registered[[name]] <<- list(
        description = description, handler = handler, echo = echo
      )
      invisible()
    }
  )

  register_builtin_commands(mod, function() "compacted")

  # Starting a fresh thread is the history drawer's own affordance: nothing in
  # shinychat's server API opens one, so a `/clear` that emptied the
  # transcript would leave the stored thread for the next response to extend.
  expect_setequal(names(registered), "compact")

  expect_false(registered$compact$echo)
  expect_identical(registered$compact$handler(), "compacted")
})
