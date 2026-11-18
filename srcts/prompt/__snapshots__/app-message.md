This message comes from the app, not from the user.
It shows the board, and what the user has on screen, as they are when this call goes out.

## Board
6 block(s), 5 link(s), 1 stack(s).

### Blocks
- iris <blockr.core-dataset_block> dataset, package [ℹ 1 message]
- head <blockr.core-head_block> n, direction [stale]
- wide <blockr.core-subset_block> subset, select [failed] [✖ 1 error, ⚠ 2 warnings]
- bind <blockr.core-rbind_block> [unevaluated]
- plot <blockr.core-scatter_block> x, y [invalid]
- joined <blockr.core-merge_block> by, all_x, all_y [waiting]
### Links
- l1: iris -> head$data
- l2: iris -> wide$data
- l3: head -> bind
- l4: wide -> bind
- l5: iris -> plot$data
### Stacks
- s1 "Input": iris, head
### Options
- n_rows (Table options)
- dark_mode (Theme options)
Current values via list_board_options; change with blockr.core-set_option.
### Plugins
- Dock (id: blockr.dock-dock_plugin)
  The dock's views, the folders that group them, the active view and the sections that each block's card shows.
- DAG (id: blockr.dag-dag_plugin)
### Views
- Analysis (id: v1) (active) iris, head, plot, blockr.assistant-assistant_plugin, blockr.dag-dag_plugin
- Overview (id: v2) (empty)

## Focus
What the user is looking at: the block that has focus, and the blocks and plugins on screen.
A request that names no block -- "this plot", "add a filter here" -- is most likely about the block that has focus, and otherwise about a block on screen.
Focus can be old, so where the request fits that block poorly, or plainly names another, go with the request.

The active view is Analysis (id: v1).
These blocks are on screen:
- iris
- plot
These plugins are on screen:
- DAG (id: blockr.dag-dag_plugin)
Block head has focus.