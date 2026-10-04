// The "+" under the assistant's composer: the blocks in the current view as
// a blockr.ui menu. Picks are sent to the server as the full set of block
// ids, which redraws the row of tags from it.
(function () {
  window.Blockr = window.Blockr || {};
  Blockr.assistant = Blockr.assistant || {};

  // The panel the user makes active, for the suggested tag. dockViewR
  // re-broadcasts every change of the active panel as this DOM event; dock's
  // own record of it drops the first panel group. dockview also activates a
  // panel on load, which is no click, so nothing counts before the first
  // pointer or key press.
  var gestured = false;
  var gesture = function () { gestured = true; };
  document.addEventListener('pointerdown', gesture, true);
  document.addEventListener('keydown', gesture, true);

  document.addEventListener('dockview:active-panel', function (e) {
    if (!gestured || !window.Shiny || !e.detail) return;
    document.querySelectorAll('.asst-focus-row[data-panel-input]')
      .forEach(function (row) {
        Shiny.setInputValue(
          row.getAttribute('data-panel-input'), e.detail.id,
          { priority: 'event' }
        );
      });
  });

  Blockr.assistant.focusMenu = function (btn) {
    if (!Blockr.Select || !Blockr.Select.menu) return;

    var blocks = JSON.parse(btn.getAttribute('data-blocks') || '[]');
    var picked = JSON.parse(btn.getAttribute('data-picked') || '[]');
    var input = btn.getAttribute('data-input');

    // The menu shows and returns its values, so the value is the block's
    // name. Two blocks of the same name are told apart by their id.
    var counts = {};
    blocks.forEach(function (b) { counts[b.name] = (counts[b.name] || 0) + 1; });
    var byValue = {};
    var valueOf = {};
    blocks.forEach(function (b) {
      var v = counts[b.name] > 1 ? b.name + ' (' + b.id + ')' : b.name;
      byValue[v] = b.id;
      valueOf[b.id] = v;
    });

    btn.setAttribute('aria-expanded', 'true');

    Blockr.Select.menu(btn, {
      title: 'Blocks in this view',
      mode: 'multi',
      reorderable: false,
      // Each pick redraws the row the button sits in.
      reanchor: function () {
        return document.querySelector('[data-input="' + input + '"]');
      },
      options: blocks.map(function (b) { return valueOf[b.id]; }),
      selected: picked.filter(function (id) { return id in valueOf; })
        .map(function (id) { return valueOf[id]; }),
      onChange: function (values) {
        var ids = (values || []).map(function (v) { return byValue[v]; })
          .filter(Boolean);
        Shiny.setInputValue(input, ids, { priority: 'event' });
      },
      onClose: function () { btn.removeAttribute('aria-expanded'); }
    });
  };
})();
