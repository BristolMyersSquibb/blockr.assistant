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
  expect_identical(registered$compact$handler(), "compacted")

  expect_false(registered$clear$echo)
  expect_identical(registered$clear$handler(), "cleared")
})

test_that("the history controller is found where shinychat parks it", {

  ctrl <- R6::R6Class(
    "FakeController",
    public = list(new_chat = function() invisible(TRUE))
  )$new()

  ns <- function(x) paste0("ext_assistant-", x)

  session <- list(
    ns = ns,
    userData = list(
      shinychat = stats::setNames(
        list(ctrl), ns("chat.history-controller")
      )
    )
  )

  expect_identical(history_controller(session), ctrl)

  # A shinychat that keys the controller differently, or parks nothing at all,
  # is what the caller's fallback is for.
  expect_null(
    history_controller(
      list(ns = ns, userData = list(shinychat = list(other = ctrl)))
    )
  )

  expect_null(history_controller(list(ns = ns, userData = list())))
})
