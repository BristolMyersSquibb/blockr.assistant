This message comes from the app, not from the user.

## Board
6 block(s) (1 waiting, 1 invalid, 1 failed, 1 unevaluated, 1 stale), 5 link(s), 1 stack(s).

### Blocks
- wide <blockr.core-subset_block> subset, select [failed] [✖ 1 error, ⚠ 2 warnings] <- data: iris (l2)
- plot <blockr.core-scatter_block> x, y [invalid] <- data: iris (l5)
- head <blockr.core-head_block> n, direction [stale] <- data: iris (l1)
- iris <blockr.core-dataset_block> dataset, package [ℹ 1 message]
- bind <blockr.core-rbind_block> [unevaluated] <- head (l3), wide (l4)
- joined <blockr.core-merge_block> by, all_x, all_y [waiting]
### Stacks
- s1 "Input": iris, head
### Dock (id: blockr.dock-dock_plugin)
The active view is Analysis (id: v1).
- Analysis (id: v1): iris, head, plot, blockr.assistant-assistant_plugin, blockr.dag-dag_plugin
- Overview (id: v2): empty

## Focus
These blocks are on screen:
- iris
- plot
These plugins are on screen:
- DAG (id: blockr.dag-dag_plugin)
Block head has focus.