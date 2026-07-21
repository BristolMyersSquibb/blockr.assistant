## Layout

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
the view, not one you are adding in the same turn.

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
   "focus": "<panel id>"}            // optional, focused panel

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

Worked examples (blocks: data, head, scatter; extension:
assistant_extension):

  * Stack blocks vertically on the left, assistant on the right:
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
