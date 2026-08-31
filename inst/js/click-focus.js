// Click a block card, and the assistant scopes to that block.
//
// dock publishes which panel is *fronted*, which catches a tab switch but not
// a click on a block that is already on screen beside another one -- and on a
// single-group board it cannot report the first group as focused at all, since
// dockView names that group "1" and dock reads "1" as "no focus". So the click
// is read from the DOM instead, where it is unambiguous.
//
// The card's element id is dock's own block handle (`block_handle-<block id>`,
// see `as_block_handle_id()`), which survives the card being moved between
// panels, so a delegated listener on the document holds however the layout is
// rearranged. The listener is passive and runs on capture, so it sees clicks a
// control inside the card would otherwise stop, and changes nothing about
// where the click lands.
(function () {
  "use strict";

  var HANDLE = /^.*block_handle-/;

  function inputId() {
    var marker = document.querySelector(".asst-card-click[data-input-id]");
    return marker ? marker.getAttribute("data-input-id") : null;
  }

  document.addEventListener(
    "click",
    function (event) {
      if (!window.Shiny || !Shiny.setInputValue) return;

      var target = event.target;
      if (!target || !target.closest) return;

      var card = target.closest('[id*="block_handle-"]');
      if (!card) return;

      var block = card.id.replace(HANDLE, "");
      if (!block) return;

      var id = inputId();
      if (!id) return;

      Shiny.setInputValue(id, block, { priority: "event" });
    },
    true
  );
})();
