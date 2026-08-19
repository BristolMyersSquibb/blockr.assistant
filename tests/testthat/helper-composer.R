# Presence in the DOM is not focusability. While the dock is still laying the
# assistant panel out, the composer is there but computes `visibility: hidden`,
# and focusing a hidden element is a silent no-op: `Input.insertText` then
# dispatches at `<body>`, the text lands nowhere, and whatever the caller waits
# for next times out on a symptom rather than on the cause. Focusing from
# inside the polled predicate is what closes that window -- each poll
# re-attempts the focus and reports whether it stuck, so this cannot return
# until the editor holds it. The chat input is a TipTap/ProseMirror
# contenteditable with no `textarea` to select, so driving it from the browser
# means CDP input events.
type_in_composer <- function(app, text, timeout = 15 * 1000) {

  app$wait_for_js(
    "(() => {
       const el = document.querySelector('.tiptap.ProseMirror');
       if (el === null) return false;
       el.focus();
       return document.activeElement === el;
     })()",
    timeout = timeout
  )

  app$get_chromote_session()$Input$insertText(text = text)

  app$wait_for_js(
    paste0(
      "document.querySelector('.tiptap.ProseMirror')",
      ".textContent.includes(", encodeString(text, quote = "\""), ")"
    ),
    timeout = timeout
  )
}
