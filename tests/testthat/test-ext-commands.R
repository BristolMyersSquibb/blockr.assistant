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

  register_builtin_commands(
    mod, function() "compacted", function() "cleared"
  )

  expect_setequal(names(registered), c("compact", "clear"))

  expect_false(registered$compact$echo)
  expect_false(registered$clear$echo)

  expect_identical(registered$compact$handler(), "compacted")
  expect_identical(registered$clear$handler(), "cleared")
})
