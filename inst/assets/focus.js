// The "+" under the assistant's composer: the blocks in the current view as
// a blockr.ui menu. Picks are sent to the server as the full set of block
// ids, which redraws the row of tags from it.
(function () {
  window.Blockr = window.Blockr || {};
  Blockr.assistant = Blockr.assistant || {};

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
