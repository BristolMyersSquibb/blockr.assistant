#' The assistant's plugin
#'
#' The assistant is a plugin whose agent loop runs in the browser.
#' The constructor `new_assistant_plugin()` makes the plugin, of class
#' `c("assistant_plugin", "plugin")`, whose plugin class has the id
#' `blockr.assistant-assistant_plugin` (see [blockr.core::new_plugin()]).
#'
#' The plugin keeps the assistant's conversations in the board, which saves
#' them with the rest of the board.
#' Each conversation, under its id, has a `title`, the time it was `updated`,
#' its `messages`, the tokens that its calls to the model spent, in `usage`,
#' and its pick of the `model`, or `NULL` for the default.
#' Where somebody picked a thinking level for it, it also has its pick of the
#' level, in `thinking_level`.
#' The JSON Schema of that state ships beside the class's module, as
#' `js/assistant_plugin.schema.json`, and R writes the state by it.
#' Only the assistant's own commands change the state, and none of them takes
#' an undo step, so that no undo takes back a message or a pick.
#'
#' The blockr option `chat_save_turns` caps how many messages of each
#' conversation the board keeps: 50 by default, `0` for none and `-1` for
#' every one.
#' A deployment sets it as the R option `blockr.chat_save_turns` or the
#' environment variable `BLOCKR_CHAT_SAVE_TURNS`.
#' The board keeps whole exchanges, each from a message that the user sent,
#' and the plugin keeps the older messages in the browser's memory while the
#' board stays open.
#' As a board opens, the plugin cuts each of its conversations to the cap.
#' Under `0`, it keeps every conversation in the browser's memory alone.
#'
#' The plugin prints a line for each conversation, the last updated first.
#' Each line gives the conversation's id and title, how many messages it
#' holds, its picks of the model and of the thinking level, and when it was
#' updated.
#' A board that holds the plugin prints it the same way.
#'
#' The package lists the class in the `._BLOCKR_MODULES_` that it exports,
#' with its name, "Assistant", and its module, `js/assistant_plugin.js` (see
#' [blockr.core::read_blocks_yml()]).
#' So [blockr.core::available_plugins()] gives the class wherever
#' blockr.assistant is available, and [blockr.core::serve()] runs the
#' assistant in every app that does not narrow its plugins.
#' The class's `ui` draws the assistant's chat wherever the frontend places
#' the plugin: the transcript of the open conversation, the message field and
#' the stop button.
#' Under the message field, a footer holds the button that opens the drawer of
#' conversations, the picks of the model and of the thinking level, and the
#' meter of the tokens that the open conversation spent.
#' The browser's local storage keeps which conversation is open.
#' A conversation takes its title from a call to the model, once its first
#' exchange that the model answered ends.
#'
#' @section Model access:
#' The assistant calls its model from the browser, never through R.
#' Four blockr options say where the calls go, how they are authenticated and
#' which models the assistant offers.
#' A deployment sets each as an R option, such as `blockr.assistant_models`,
#' or as an environment variable, such as `BLOCKR_ASSISTANT_MODELS`.
#'
#' * The blockr option `assistant_base_url` gives the base URL that every call
#'   goes to, OpenAI's `https://api.openai.com/v1` by default.
#'   A gateway, such as OpenRouter at `https://openrouter.ai/api/v1`, or a
#'   company's own proxy can take its place.
#'   Anthropic's API is at `https://api.anthropic.com`, without `/v1`, since
#'   the assistant appends `/v1/messages` to it.
#' * The blockr option `assistant_api` gives the API that the base URL speaks:
#'   OpenAI's Responses API as `"openai-responses"`, the default, OpenAI's
#'   Chat Completions API as `"openai-completions"`, or Anthropic's Messages
#'   API as `"anthropic-messages"`.
#'   The assistant does not work out which API a base URL speaks.
#' * The blockr option `assistant_api_key` gives the key that every call
#'   carries, or `"none"` for a base URL that needs no key, so that no call
#'   carries one.
#'   The assistant reads a key from this option alone, never from a variable
#'   such as `OPENAI_API_KEY`, so that a key set for code in R reaches no
#'   browser unless the deployment sets it here.
#'   Any visitor who can use the assistant can read the key from the page.
#'   Where the option is unset, the chat asks each visitor for a key of their
#'   own.
#' * The blockr option `assistant_models` gives the ids of the models offered,
#'   the first being the default, as a character vector or as one string that
#'   separates them by commas, such as `"gpt-5.4,gpt-5.4-nano"`.
#'   Where it is unset, the assistant offers the models of the base URL's list
#'   of models that take tools, the first being the default.
#'
#' The assistant asks for the base URL's list with the key as each board
#' opens, and with the visitor's key as soon as the visitor gives it.
#' Where the base URL refuses the key, it raises the error
#' `assistant_call_failed`.
#' Where the list fails otherwise, or holds no model that takes tools, it
#' raises the error `assistant_models_failed`, and asks again as the user
#' sends.
#' A conversation talks to its pick of the model where the deployment offers
#' it, and to the default otherwise.
#'
#' OpenAI's refusal of a call's key reaches the page as a failed connection.
#' So where a call with a key fails that way, the assistant asks the base URL
#' for its list of models with the same key, which tells a refused key from a
#' lost connection.
#' The error `assistant_call_failed` then says that the base URL refused the
#' key, or, where the list fails as well, that the connection was lost and
#' that the key may be wrong.
#'
#' The plugin keeps the visitor's own key in the page's memory, and writes it
#' to neither the board nor R.
#' So another board that opens in the page keeps the key.
#' Unless the deployment sets the blockr option `assistant_key_secret`, the
#' plugin writes the key to no browser storage either, so a reload asks for
#' the key again.
#' The browser takes the field for the key for a login, with the host of the
#' base URL as the user name, so that its password manager can save the key,
#' where the visitor lets it, and fill it in after a reload.
#' Until the visitor gives a key, the chat sends nothing.
#' Where the base URL refuses the key, for a call or for its list of models,
#' the chat asks for a key again.
#' Where the connection was lost and the key may be wrong, the chat shows the
#' field for the key again, holding the key.
#'
#' The blockr option `assistant_key_secret` has the browser keep the visitor's
#' key as well, in its local storage, so that a reload or another tab of the
#' app finds the key.
#' A deployment sets it as the environment variable
#' `BLOCKR_ASSISTANT_KEY_SECRET`, so that every R process of the app hands the
#' page the same secret.
#' The page encrypts the key with the secret, which R hands the page with the
#' other blockr options, so the key still never reaches R.
#' The secret has to be a long random string, such as one that
#' `openssl rand -base64 32` prints, and never a password or a phrase that a
#' person chose.
#' The page derives its encryption key from the secret through HKDF, which,
#' unlike a hash for passwords, does nothing to slow down a guess at the
#' secret.
#' So whoever copies the keys that the browser kept, as from the browser's
#' files, can try guesses at the secret as fast as their computers allow, and
#' a secret that they guess decrypts every key that they copied.
#' The browser keeps one key for each app and base URL to which the visitor
#' gave a key.
#' It keeps a key from the time that the base URL takes it, for a call or for
#' its list of models, until the base URL refuses it.
#' Changing the secret makes every key that the browser kept unreadable, so
#' each visitor then gives their key again.
#' The browser keeps the key only on a page that it deems secure, such as one
#' served over HTTPS or from localhost, since it offers the page no means to
#' encrypt the key otherwise.
#'
#' The option trades some safety for convenience.
#' Every page that the same origin serves can read local storage, whoever
#' published that page.
#' Posit Connect, for one, serves each content item under a path of one host,
#' as `https://connect.example.com/content/<guid>/` or a vanity URL such as
#' `https://connect.example.com/my-dashboard/`.
#' Where the secret is random, the encryption keeps the key from whatever
#' reads local storage without running the app, such as a script that dumps
#' the storage, or a copy of the browser's files whose holder cannot open the
#' app.
#' Keeping one key for each app keeps another blockr app from taking a key
#' that the visitor gave this one.
#' Neither keeps out a page of the same origin that sets out to get the key.
#' Such a page comes from a malicious app on the origin, or from a hole in
#' another app's page through which an attacker runs script there.
#' It can list every key that the browser keeps, and can load the app and get
#' the secret as the app does.
#' So a deployment sets the option where the app has an origin of its own, or
#' where it trusts every page of its origin.
#'
#' Where the base URL is OpenRouter's, `https://openrouter.ai/api/v1`, the
#' chat also offers OpenRouter's login beside the field for the key.
#' The login gives the page a key on the visitor's own OpenRouter account,
#' which OpenRouter bills to the visitor's credits.
#' So an app that sets `BLOCKR_ASSISTANT_BASE_URL=https://openrouter.ai/api/v1`
#' and `BLOCKR_ASSISTANT_API=openai-completions`, and no key, lets each
#' visitor log in.
#' The login runs in a window of its own, so that the app's page stays as it
#' was.
#' Once the visitor authorizes the app, OpenRouter sends that window to the
#' page `js/openrouter.html`, which the package ships beside the plugin's
#' module.
#' That page hands the login's code to the app's page, and closes the window.
#' The plugin then exchanges the code for the key, and keeps the key as it
#' keeps a typed key.
#' OpenRouter's page labels the key `blockr`, and has it expire after a day,
#' or after 30 days where the browser keeps the key.
#' The visitor can change both as they authorize the app.
#' The chat offers the login only on a page that the browser deems secure,
#' such as one served over HTTPS or from localhost.
#'
#' @section Model settings:
#' A model's settings say whether it reasons and at which thinking level,
#' whether it takes images, how many tokens its context window holds, and how
#' many tokens each call asks for the reply.
#' The assistant takes each setting of a model from the first of these that
#' gives it:
#'
#' 1. The YAML file that the blockr option `assistant_model_settings` names,
#'    such as through the environment variable
#'    `BLOCKR_ASSISTANT_MODEL_SETTINGS`.
#' 2. The catalogs of OpenAI's and Anthropic's models of pi, the library that
#'    runs the assistant's turns.
#'    Where the base URL is OpenRouter's or that of Vercel's AI Gateway, they
#'    include pi's catalog of the gateway's models too, under the gateway's
#'    ids, such as `openai/gpt-5.4`.
#'    The assistant takes the catalogs' model that the file names in `like`,
#'    or else their model of the same id.
#' 3. The base URL's list of models, where the assistant offers the models of
#'    the list.
#'    OpenRouter's, Vercel's and Anthropic's lists give each model's context
#'    window, its cap for a reply and whether it takes images.
#' 4. The defaults: the model does not reason, takes images, has a context
#'    window of 128,000 tokens and takes up to 16,384 tokens for a reply.
#'
#' The file gives the settings of each model under the model's id:
#'
#' ```yaml
#' corp-claude:
#'   like: claude-sonnet-5-5
#' corp-gpt:
#'   reasoning: true
#'   thinking_level: high
#'   images: false
#'   context_window: 200000
#'   max_tokens: 32000
#' ```
#'
#' * The setting `like` names a model of pi's catalogs of OpenAI's and
#'   Anthropic's models, such as `claude-sonnet-5-5`, whose settings the model
#'   takes where the file gives none.
#'   So a model that a company's own proxy serves under a name of its own
#'   takes the settings of the model behind the name.
#'   Where the proxy speaks the API of the model behind the name, those
#'   include what pi sends that API, such as the adaptive thinking that
#'   Anthropic's current models need.
#' * The setting `reasoning` says whether the model reasons, so that the
#'   assistant asks it to.
#' * The setting `thinking_level` gives the thinking level at which the
#'   assistant asks the model to reason: `off`, `minimal`, `low`, `medium`,
#'   `high`, `xhigh` or `max`.
#'   Where the file gives none, the level is `medium`.
#'   But on OpenAI's Chat Completions API, a model whose `like` or id names a
#'   model of pi's catalog of OpenAI's models takes the level `off`.
#'   That API refuses function tools with any reasoning effort but `none` for
#'   OpenAI's GPT-5.4 models.
#'   A level that the model does not take, such as `off` for `gpt-5`, counts
#'   as none, so that the model takes the default.
#'   For the level `off`, pi sends the effort `none` to a model that takes it,
#'   such as `gpt-5.4`, and no effort to the others, such as `o3`.
#'   A conversation's pick of the level, in the chat's footer, replaces the
#'   file's level and the default, but on Chat Completions for a model of
#'   pi's catalog of OpenAI's models.
#'   The footer offers the levels that pi gives for the model, where they are
#'   two or more.
#'   A picked level that the model does not take, as after a pick of another
#'   model, the assistant moves to the next level up that the model takes, or
#'   else to the next one down.
#'   A model that does not reason gets no effort, whatever its level.
#' * The setting `images` says whether the model takes images.
#'   For a model that takes none, the assistant sends a note in place of each
#'   plot of `inspect_results`, and of each image and PDF that the user
#'   attaches.
#' * The setting `context_window` gives the tokens that the model's context
#'   window holds, and `max_tokens` the most tokens that each call asks for
#'   the reply.
#'
#' R reads the file as each board opens.
#' It reads only `true` and `false` as booleans, as YAML 1.2 does.
#' So an unquoted `off` stays the level `off`, and `reasoning: yes` is a
#' value that `reasoning` does not take.
#' Where R cannot read the file, or where the file gives a value that a
#' setting does not take, the assistant raises the error
#' `assistant_model_settings_failed`.
#' It then goes on without the file until the next board opens.
#' The assistant finds a `like` that names no model of pi's catalogs only once
#' it loads the catalogs, as the chat first shows, or as the assistant first
#' calls a model on the board.
#'
#' @section Compaction:
#' The assistant compacts a conversation as pi's own CLI does.
#' Before each call to the model, it estimates the tokens that the call would
#' send.
#' Where they pass the model's context window less 16,384 tokens, a call of
#' its own writes a summary of the older messages first, which takes their
#' place in the conversation.
#' The newest messages stay as they were, up to a quarter of the window.
#' A call that fails since the conversation outgrew the window gets a summary
#' too, and the assistant then makes the call once more.
#' The window is the one that the model settings, pi's catalogs or the base
#' URL's list give the model, or else 128,000 tokens.
#' So a deployment sets when compaction runs through a model's
#' `context_window`.
#' Where a compaction fails, the conversation stays as it was, and the
#' assistant raises the warning `assistant_compaction_failed`.
#'
#' @section Attachments:
#' The user attaches images in PNG, JPEG, GIF or WebP, PDFs and text files to
#' a message, through the button beside the message field, by dropping them
#' on the chat or by pasting them.
#' The files of one message take up to 30 MiB together.
#' An image whose longer side passes 1568 pixels is scaled down to it.
#' A paste of more than 1,000 characters becomes a text file, "Pasted Text".
#'
#' The board keeps the name and the media type of each file, but not its
#' content.
#' The browser keeps a copy of the content while the board stays open, so that
#' the file stays attached once the user deletes or edits it on disk.
#' The assistant sends the content to the model with the message and with each
#' later call of the conversation.
#' It sends a text file as its text, an image as an image, and a PDF in the
#' block of the API for a file.
#' Once the board opens again, the model learns only that the user attached
#' the file.
#'
#' A provider may refuse a file, as one that it cannot read or one larger than
#' it takes.
#' Anthropic's API, for one, takes a PDF of up to 32 MB as base64, which a
#' PDF of about 24 MiB reaches.
#' The turn then ends, and the assistant raises the error
#' `assistant_attachment_refused`, which names the file and says why.
#' The conversation's later calls go without the file, and a later call of the
#' conversation that succeeds withdraws the error.
#'
#' @section Requests:
#' The class answers six requests in R, through its method of
#' [blockr.core::plugin_requests()].
#' R calls each with the plugin's args by name, and with the blocks that it
#' reads in `reads`, where the request takes them.
#' The requests that read skills take the app's packages by name, in
#' `packages`, which the plugin sends as R named them in its reply to `hello`.
#'
#' * The request `describe_result` gives what [describe_result()] writes about
#'   the result of each block that it reads, by block id.
#'   It cuts each text at the blockr option `assistant_summary_max_chars`,
#'   2000 by default.
#' * The request `inspect_results` runs the R code in `code` with a PNG device
#'   open.
#'   The code runs in an environment whose parent is `baseenv()`, which binds
#'   the result of each block that the request reads to the block's id.
#'   The request gives what the code prints in `output`, cut at the blockr
#'   option `assistant_eval_max_chars`, 16000 by default.
#'   It gives the plots that the code draws in `plots`, each a PNG as a base64
#'   string, up to `assistant_plot_render_max`, 4 by default.
#'   They are `width` by `height` pixels, within
#'   `assistant_plot_render_range`, 200 to 2000 by default.
#'   Either is `assistant_plot_render_px`, 768 by default, where it is left
#'   out.
#'   R refuses the request on a locked board, where the blockr option `locked`
#'   is on.
#' * The request `list_skills` gives the skills (below), each with its `name`
#'   and `description`, the block classes that it names in `blocks`, the
#'   plugin classes that it names in `plugins`, and its flags
#'   `user-invocable` and `disable-model-invocation`.
#' * The request `read_skill` gives the text of the skill `name`, or that of
#'   the file at `path` that the skill bundles.
#' * The request `read_template` gives the text of the file that the blockr
#'   option `assistant_template` names, or `NULL` where it names none.
#' * The request `read_model_settings` gives what the YAML file that the
#'   blockr option `assistant_model_settings` names holds, or `NULL` where it
#'   names none.
#'   It reads only `true` and `false` as booleans, as YAML 1.2 does.
#'
#' @section Template:
#' Each call to the model sends the system prompt, then the conversation,
#' then a message of the app's with the board and what the user has on
#' screen.
#' Where others changed the board's blocks, links or stacks since the
#' conversation's previous call, the conversation ends on a note of the app's,
#' which says what changed and who changed it.
#' The parts below make them up, in the order in which the model reads them.
#' A deployment's template is the Markdown file that the blockr option
#' `assistant_template` names, which a deployment sets as the R option
#' `blockr.assistant_template` or the environment variable
#' `BLOCKR_ASSISTANT_TEMPLATE`.
#' It takes the place of the three parts that have an id: it names each part
#' that it keeps as `<<id>>` on a line of its own, in the order that it wants,
#' and may add text of its own.
#' The plugin writes every other part, whatever the template holds.
#'
#' \tabular{lll}{
#'   \strong{Part} \tab \strong{Id} \tab \strong{What it tells the model} \cr
#'   Role \tab \code{role} \tab
#'     That it is an assistant next to a blockr data analysis board \cr
#'   Build, don't ask \tab \code{build} \tab
#'     To build what the user wants analysed, with defaults from the data,
#'     rather than ask \cr
#'   Style \tab \code{style} \tab To answer concisely \cr
#'   What the app sends you \tab none \tab
#'     That a message of the app's follows the conversation, with the board
#'     and what the user has on screen, that a note says what others changed,
#'     and that what the user changed is what the user wants \cr
#'   Statuses \tab none \tab
#'     What each status marker in the Board section means \cr
#'   Look, don't guess \tab none \tab
#'     That summaries are cut short, so it reads what it relies on rather
#'     than guessing \cr
#'   Edits \tab none \tab
#'     That ids never change, and that changing one needs the user's yes \cr
#'   Skills \tab none \tab
#'     Each skill that names no block class or plugin class, and when to read
#'     one \cr
#'   Changes \tab none \tab
#'     What others changed in the board's blocks, links and stacks since the
#'     conversation's previous call, and who changed it, in a note of the
#'     app's that the conversation keeps \cr
#'   Board \tab none \tab
#'     The board as it is when the call goes out, in the app's message \cr
#'   Focus \tab none \tab
#'     Which block has focus and what the user has on screen, in the app's
#'     message
#' }
#'
#' As a board opens, the plugin has R read the template once.
#' Where R cannot read it, or it names an id that is none of the three, the
#' plugin raises the error `assistant_template_failed`.
#' The calls then go on with blockr.assistant's own template until the next
#' board opens.
#'
#' @section Skills:
#' A skill is a directory that holds a `SKILL.md`.
#' The file's YAML frontmatter gives the skill's `name`, which is the
#' directory's, and its `description`.
#' It may name block classes by their registry ids in `blocks:`, plugin
#' classes by their ids in `plugins:`, and the packages that the skill needs
#' in `requires:`.
#' It may also set the flags `user-invocable` and `disable-model-invocation`.
#'
#' R lists the skills of each of the app's packages, from the package's
#' `inst/assistant/skills`, in the order of the packages' names.
#' It then lists those of the directory that the blockr option
#' `assistant_skills` names.
#' A skill takes the place of one of the same name that R listed before it.
#' R does not read a package's `inst/skills`, where btw finds the skills that
#' it gives coding agents.
#'
#' As a board opens, the plugin has R list the skills once, and the model reads
#' them through the assistant's tools.
#' Where R cannot list them, as for a directory in `assistant_skills` that does
#' not exist, the plugin raises the error `assistant_skills_failed`.
#' The assistant then goes on without skills until the next board opens.
#'
#' @param conversations The conversations of a board that an app script
#'   builds, by id, each a list in the shape that the schema gives.
#' @param x The assistant's plugin.
#' @param ... Unused.
#'
#' @return The constructor `new_assistant_plugin()` returns a `plugin` object,
#' as [blockr.core::new_plugin()] returns it.
#' The method of `plugin_requests()` returns the six requests, a list of
#' functions by name.
#'
#' @examples
#' new_assistant_plugin()
#'
#' blockr.core::plugin_class_id(new_assistant_plugin())
#'
#' plugin <- new_assistant_plugin(
#'   conversations = list(
#'     c1 = list(
#'       title = "Sales by region",
#'       updated = "2026-11-16T08:00:00Z",
#'       messages = list(
#'         list(
#'           id = "m1",
#'           role = "user",
#'           parts = list(
#'             list(type = "text", text = "Sum the sales by region.")
#'           ),
#'           created = "2026-11-16T08:00:00Z"
#'         )
#'       ),
#'       usage = list(input = 0, output = 0, last = 0),
#'       model = NULL
#'     )
#'   )
#' )
#'
#' plugin
#'
#' names(blockr.core::plugin_state(plugin)[["conversations"]])
#'
#' @export
new_assistant_plugin <- function(conversations = list()) {

  if (!is_conversations(conversations)) {
    blockr_abort(
      "Expecting `conversations` to be a list of conversations, each named ",
      "by its id.",
      class = "invalid_conversations"
    )
  }

  new_plugin(list(conversations = conversations), "assistant_plugin")
}

# Whether `x` is a list of conversations by id: empty, or with a name for each
# conversation that no other conversation has.
is_conversations <- function(x) {

  if (!is.list(x) || is.object(x)) {
    return(FALSE)
  }

  ids <- names(x)

  !length(x) ||
    (!is.null(ids) && !anyNA(ids) && all(nzchar(ids)) && !anyDuplicated(ids))
}

# The print gives a line for each conversation, the last updated first, as the
# chat's drawer lists them.
# The method sorts the times in `updated` as strings, by their bytes.
# That sorts them by time where all of them have one form, such as the form
# that `toISOString()` gives in the client.
# Conversations with the same time keep their order in the state.
#' @export
format.assistant_plugin <- function(x, ...) {

  conversations <- plugin_state(x)[["conversations"]]

  updated <- chr_xtr(conversations, "updated")
  conversations <- conversations[
    order(updated, decreasing = TRUE, method = "radix")
  ]

  c(
    paste0("<", class(x)[1L], "> ", plugin_class_id(x)),
    chr_mply(format_conversation, names(conversations), conversations)
  )
}

# The line of the conversation `id` in the print of the assistant's plugin.
format_conversation <- function(id, conversation) {

  n <- length(conversation[["messages"]])
  model <- conversation[["model"]]
  level <- conversation[["thinking_level"]]

  paste0(
    id, ": ", conversation[["title"]],
    " (", n, if (n == 1L) " message" else " messages",
    ", ", if (is.null(model)) "default model" else paste("model", model),
    if (!is.null(level)) paste(", thinking level", level),
    ", updated ", conversation[["updated"]], ")"
  )
}

#' @rdname new_assistant_plugin
#' @format NULL
#' @usage NULL
#' @export
._BLOCKR_MODULES_ <- list( # nolint: object_name_linter.
  plugins = list(
    new_assistant_plugin = list(
      id = "assistant_plugin",
      name = "Assistant",
      module = "js/assistant_plugin.js"
    )
  )
)
