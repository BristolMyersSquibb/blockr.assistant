---
name: layout
description: >-
  Arranging views and panels on a dock board: the JSON layout grammar
  add_view takes, rails included (panels pinned to a view's edge), and
  the panel-op tools (add_panel_to_view, remove_panel_from_view,
  move_panel, resize_panel, focus_panel) that edit an existing view in
  place. Read before creating a view or rearranging panels.
---

# Layout

Views are tabs; each holds an arrangement of panels (blocks and
extensions). add_view takes a layout in the JSON spec form below
and creates a view arranged exactly as you pass it -- a whole
layout is the sanctioned move only at a view's birth. Read the
current shape with list_views.

To change an existing view, don't re-emit a layout -- edit it in
place with the atomic panel-op tools, which compose into one
update when you commit:

- add_panel_to_view(view, panel, near, side, size): add a block or
  extension to the view. `near` (a panel already in the view) and
  `side` (within / left / right / above / below, relative to
  near) are optional placement hints; omit both for a default
  spot. `within` tabs the panel into near's group. An optional
  `size` (a ratio in (0, 1)) records the panel's target size along
  its split axis.
- remove_panel_from_view(view, panel): drop a panel from the
  view. The block or extension stays on the board.
- move_panel(view, panel, near, side): reposition a panel already
  in the view next to `near` on the given `side`. Membership is
  unchanged.
- resize_panel(view, panel, size): set the panel's group `size` (a
  ratio in (0, 1)) along its split axis, relative to its siblings.
  The panel must already be in the view; membership and
  arrangement are unchanged.
- focus_panel(view, panel): bring a panel already in the view to
  the front of its tab group and focus it, switching to the view
  if it isn't the active one. Use it to surface a specific block
  or extension -- e.g. one you just added or evaluated.

dock owns the live arrangement, so placement is a hint, not a
guarantee of exact geometry. `near` must be a panel already in
the view, not one you are adding in the same turn. These verbs
all work inside the split arrangement; none of them reaches a
rail (see Rails below).

Each view has a stable `id` and a display `name`. Address an
existing view by its `id` (from list_views) in the panel-op
tools, remove_view, set_active_view and rename_view. add_view
takes a display `name`; the board assigns the id. rename_view
changes only the label, never the id.

The same block or extension may appear in more than one view -- a
panel is a single instance that renders in whichever view is
active (views are mutually-exclusive tabs). Placing the assistant
(or any block) in several views is allowed; don't refuse it.

Top-level shape (object):
  {"orientation": "horizontal"|"vertical",
   "children": [<node>, ...],
   "sizes": [<num>, ...],            // optional, length == #children
   "focus": "<panel id>",            // optional, focused panel
   "rails": {<edge>: <rail>, ...}}   // optional, see Rails below

Each <node> inside `children` is one of:

- a bare ID string: a single-panel leaf
- `{"panels": [<id>, ...], "active": "<id>"}`: a tabbed leaf
  (`active` optional, defaults to the first). A tab group is
  ALWAYS this object -- never a bare array of IDs.
- `{"children": [<node>, ...], "sizes": [<num>, ...]}`: a nested
  split (sizes optional). Nested branches use the same `children`
  key as the top level. Orientation alternates with depth
  automatically -- only the top level names an `orientation`;
  there is no per-branch `orientation` key.

Sizes are positive numbers, one per child. They are ratios; their
absolute scale does not matter (`[1, 2]`, `[0.33, 0.67]`, and
`[33, 67]` are equivalent).

## Rails

A rail is a tab group pinned to an edge of the view itself, outside
the split arrangement `children` describes -- where the default board
parks its extensions. The optional `rails` key is an object keyed by
edge, `"left"` or `"right"`, holding at most one rail per edge:

  {"panels": [<id>, ...],    // the panels pinned there
   "active": "<id>",         // optional open tab, first by default
   "collapsed": true|false}  // optional, opens as a bare tab strip

A rail is not a child: it never appears in `children` and never
counts towards `sizes`, so a layout with two children and a rail
carries two sizes, not three. Every panel is either in the tree or in
one rail, never both. A rail's width is dock's to set -- there is no
size to pass, and the `sizes` ratios do not apply to it.

Do not confuse a rail's edge with the `side` argument of the panel-op
tools. Both spell their values "left" and "right" and they mean
different things: `side` is a direction relative to a `near` panel
inside the split arrangement, while a rail's edge is a side of the
whole view. There is also no verb that moves a panel into or out of a
rail, so a view's rails are set once, by the add_view layout that
creates it.

Worked examples (blocks: data, head, scatter; extension:
assistant_extension):

  * The board's default arrangement -- extensions railed on the
    left, blocks tabbed in the grid. Start here when a new view
    should look like the rest of the board:
    {"orientation": "horizontal",
     "children": [{"panels": ["data", "head", "scatter"],
                   "active": "data"}],
     "rails": {"left": {"panels": ["assistant_extension"],
                        "collapsed": false}}}

  * Blocks split on the left, assistant railed on the right and
    opening collapsed to its tab strip:
    {"orientation": "horizontal",
     "children": [{"children": ["data", "head"]}, "scatter"],
     "sizes": [0.6, 0.4],
     "rails": {"right": {"panels": ["assistant_extension"],
                         "collapsed": true}}}
    The rail is not a child, so `sizes` has one entry per element of
    `children` -- two here, not three.

  * Stack blocks vertically on the left, assistant beside them as an
    ordinary panel in the tree rather than railed:
    {"orientation": "horizontal",
     "children": [
       {"children": ["data", "head", "scatter"]},
       "assistant_extension"],
     "sizes": [0.7, 0.3]}
    Top split is horizontal (inner branch + assistant). The inner
    branch names no orientation; depth-alternation makes it
    vertical automatically.

  * Combine data + head into a tab group, scatter beside them:
    {"orientation": "horizontal",
     "children": [
       {"panels": ["data", "head"], "active": "data"},
       "scatter",
       "assistant_extension"],
     "sizes": [0.4, 0.35, 0.25]}

  * Everything in one column:
    {"orientation": "vertical",
     "children": ["data", "head", "scatter",
                   "assistant_extension"]}

  * Nested layout, depth 3 (data top-left; head and scatter
    split below it; assistant down the right side):
    {"orientation": "horizontal",
     "children": [
       {"children": [
          "data",
          {"children": ["head", "scatter"]}
       ]},
       "assistant_extension"],
     "sizes": [0.7, 0.3]}
    Orientation alternates with depth: top is horizontal, the
    outer nested branch is vertical (data above head|scatter), the
    inner branch is horizontal again (head | scatter).

Probe an add_view layout with `validate_layout(layout)` if you're
unsure -- it parses, checks panel IDs, and returns the normalized
form without touching board state.

Blocks referenced by a view layout must exist on the board (or
be staged for creation in the same turn). Removing a block
automatically drops its panels from every view containing it
-- no explicit cleanup needed.
