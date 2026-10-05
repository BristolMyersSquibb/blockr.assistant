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

  // The panel dockview made active on load. A click on it changes nothing,
  // so dockview announces nothing, and it is forwarded from the click until
  // an activation is announced.
  var unannounced = null;

  // One press can announce more than one panel. A click on a tab behind
  // another, in a group that is not active, has dockview announce the
  // group's front panel on pointerdown and the clicked one on click, so
  // forwarding both would offer the wrong block first and redraw the tags
  // twice. Only the last panel announced is forwarded, once the press is
  // over and the announcements have settled.
  var pressing = false;
  var latest = null;
  var timer = null;

  var forward = function (id) {
    if (!window.Shiny) return;
    document.querySelectorAll('.asst-focus-row[data-panel-input]')
      .forEach(function (row) {
        Shiny.setInputValue(
          row.getAttribute('data-panel-input'), id, { priority: 'event' }
        );
      });
  };

  var settle = function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      if (pressing || latest === null) return;
      forward(latest);
      latest = null;
    }, 100);
  };

  // The panel a pointer lands in, by its tab or by its content, which
  // dockViewR renders with the id `<dock>-<panel>`.
  var panelOf = function (el) {
    if (!el || !el.closest) return null;
    var tab = el.closest('.dv-tab');
    if (tab) return tab.getAttribute('data-tab-panel-id');
    var panel = el.closest('.dockview-panel');
    var dock = panel && panel.closest('.dockview');
    if (!dock || panel.id.indexOf(dock.id + '-') !== 0) return null;
    return panel.id.slice(dock.id.length + 1);
  };

  document.addEventListener('pointerdown', function (e) {
    gestured = true;
    pressing = true;
    if (unannounced !== null && panelOf(e.target) === unannounced) {
      latest = unannounced;
      unannounced = null;
    }
  }, true);

  var release = function () {
    pressing = false;
    settle();
  };

  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  document.addEventListener('keydown', function () {
    gestured = true;
  }, true);

  document.addEventListener('dockview:active-panel', function (e) {
    if (!e.detail) return;
    if (!gestured) {
      unannounced = e.detail.id;
      return;
    }
    unannounced = null;
    latest = e.detail.id;
    if (!pressing) settle();
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
