# The dock sizes the assistant rail when the app loads and does not re-flow it
# on a later resize, so the rail's width is decided by whatever viewport the
# browser happened to open with. That default is per-platform, and the macOS
# runner opened narrow enough that the rail's content box fell under the 140px
# container-query threshold: the chat slot was blanked, and the composer inside
# it could not take focus (#151). Measured locally, loading at 600px puts the
# rail at 156px with a 136px content box and blanks the chat, while loading at
# 1600px puts it at 211px. Resizing after load does neither, which is why a
# resize-based probe reports a rail that never narrows. Pinning the viewport is
# what makes the layout the same on every runner.
asst_app_driver <- function(app_dir, ...) {
  shinytest2::AppDriver$new(app_dir, ..., width = 1600, height = 1200)
}
