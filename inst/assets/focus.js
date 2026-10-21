// The panel the user last made active on the board, for the assistant's
// prompt. dockViewR re-broadcasts every change of the active panel as the
// `dockview:active-panel` DOM event; dock's own record of it drops the first
// panel group. dockview also activates a panel on load, which is no click,
// so nothing counts before the first pointer or key press.
(function () {
  var gestured = false;

  // The panel dockview made active on load. A click on it changes nothing,
  // so dockview announces nothing, and it is forwarded from the click until
  // an activation is announced.
  var unannounced = null;

  // One press can announce more than one panel. A click on a tab behind
  // another, in a group that is not active, has dockview announce the
  // group's front panel on pointerdown and the clicked one on click, so
  // forwarding both would tell the server about a block nobody pressed.
  // Only the last panel announced is forwarded, once the press is over and
  // the announcements have settled.
  var pressing = false;
  var latest = null;
  var timer = null;

  var forward = function (id) {
    if (!window.Shiny) return;
    document.querySelectorAll('[data-asst-panel-input]')
      .forEach(function (el) {
        Shiny.setInputValue(
          el.getAttribute('data-asst-panel-input'), id, { priority: 'event' }
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
})();
