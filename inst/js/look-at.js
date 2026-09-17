// look_at: a picture of the board as this browser shows it, for the
// assistant's `look_at` tool. The server names a target, this rasterises the
// page with snapdom, cuts the target's region out of it and hands the PNG
// back as a Shiny input.
//
// Message: { id, input, handle } -- `handle` is a block or extension handle
// id, or null for the whole page. Dock namespaces handle ids with the board's
// module id, so they are matched by suffix.
//
// Why the page and a cut, not the panel's element: dockview draws panel
// content in an overlay layer (.dv-render-overlay) that is not a descendant
// of the tab group it sits in. No single element holds a panel together with
// its tab strip, so the region is what identifies it.
(function () {

  var MAX_WIDTH = 1400;

  function box(r) {
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  function intersects(r, region) {
    return r.bottom >= region.top && r.top <= region.bottom &&
      r.right >= region.left && r.left <= region.right;
  }

  // A panel behind another tab keeps its node and a full-size box, parked
  // with visibility:hidden, so size alone does not tell.
  function shown(el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (!el.checkVisibility({ visibilityProperty: true })) return false;
    return intersects(r, viewport());
  }

  function viewport() {
    return { left: 0, top: 0, right: window.innerWidth,
             bottom: window.innerHeight };
  }

  // The tab group the panel sits in, found by position, so the tab strip and
  // the panel header are in the picture.
  function region(handle) {
    if (!handle) return viewport();
    var el = document.querySelector('[id$="' + CSS.escape(handle) + '"]');
    if (!el || !shown(el)) return null;
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var groups = document.querySelectorAll('.dv-groupview');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i].getBoundingClientRect();
      if (x >= g.left && x <= g.right && y >= g.top && y <= g.bottom) {
        return box(g);
      }
    }
    return box(r);
  }

  // Cloning is what costs: most of a board's nodes are table rows below the
  // fold and panels scrolled out of sight. Drop what lies outside the
  // viewport -- not outside the target's region: dropping the navbar above a
  // panel shifts the clone's layout up by its height and the cut lands low.
  // A zero-size element stays unless it is display:none, because absolutely
  // positioned content hangs off such wrappers.
  function keep() {
    var reg = viewport();
    return function (node) {
      if (!(node instanceof Element)) return true;
      // The chat is left blank: mid-call it shows this very tool as running,
      // which the model then reports as a stuck spinner.
      if (node.classList.contains('asst-chat-slot')) return false;
      var r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        return getComputedStyle(node).display !== 'none';
      }
      return intersects(r, reg);
    };
  }

  function cut(canvas, reg) {
    var origin = document.body.getBoundingClientRect();
    var ratio = canvas.width / origin.width;
    var left = Math.max(reg.left, 0), top = Math.max(reg.top, 0);
    var w = Math.min(reg.right, window.innerWidth) - left;
    var h = Math.min(reg.bottom, window.innerHeight) - top;
    var scale = Math.min(1, MAX_WIDTH / w);
    var out = document.createElement('canvas');
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    out.getContext('2d').drawImage(
      canvas,
      (left - origin.left) * ratio, (top - origin.top) * ratio,
      w * ratio, h * ratio,
      0, 0, out.width, out.height
    );
    return out.toDataURL('image/png');
  }

  function reply(msg, value) {
    value.id = msg.id;
    Shiny.setInputValue(msg.input, value, { priority: 'event' });
  }

  Shiny.addCustomMessageHandler('blockr-assistant-look-at', function (msg) {

    var reg = region(msg.handle);

    if (!reg) {
      reply(msg, { error: 'not on screen' });
      return;
    }

    // dpr: 1 because snapdom multiplies the scale by the device pixel ratio,
    // which doubles the picture on a retina screen.
    window.snapdom.toCanvas(document.body, {
      scale: 1,
      dpr: 1,
      embedFonts: true,
      filter: keep()
    }).then(function (canvas) {
      reply(msg, { png: cut(canvas, reg) });
    }).catch(function (e) {
      reply(msg, { error: String(e) });
    });
  });
})();
