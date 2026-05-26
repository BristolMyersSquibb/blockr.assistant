# Pharma demo: incremental prompts

Five prompts to paste into the assistant chat one at a time, in order.
Each step is a checkpoint — verify the board state in the running app
before moving on.

The target board has the `dag_extension` and `assistant` extensions
mounted. No blocks at the start. Launch via
`inst/examples/empty-board/app.R`.

A shared `dm_example_block` loads the full safetyData ADaM set; a
global `crossfilter_block` filters it; two branches read from the
filtered dm. One renders a Table 1 of demographics; the other a
waterfall of AE counts per subject where clicking a bar selects that
subject. A `patient_profile_block` then renders the selected
subject's profile.

---

## 1. Source — dm + global filter

```
Add a dm_example_block loading the "safetydata_adam" dataset. Then
add a crossfilter_block downstream of it with active_dims for the
adsl table on TRT01A, SEX, and RACE -- this becomes the global
filter every branch reads from.
```

**Expected:** two blocks (`dm_example_block`, `crossfilter_block`)
and one link wiring dm → crossfilter.

## 2. Demographics — Table 1

```
From the global filter, pull the adsl table. Build a Table 1 (AGE,
SEX, RACE, BMIBL) by TRT01A using summary_table_block with compact
stats and an overall column, and render with gt_table_block.
```

**Expected:** dm_pull(adsl) → summary_table → gt_table, three blocks
and three links.

## 3. AE waterfall — patient-selectable

```
From the global filter, pull the adae table. Add a
drilldown_chart_block configured as a count waterfall: chart_type
"bar", group="USUBJID", metric=".count", agg_fn="count",
sort_by="value", sort_dir="desc", drill="USUBJID". Color by TRTA.
This becomes the patient-selecting chart: clicking a bar will
emit the clicked USUBJID downstream.
```

**Expected:** dm_pull(adae) → drilldown_chart, two new blocks and
two new links. `drill="USUBJID"` is what makes the chart's clicks
flow as a patient signal.

## 4. Patient profile

```
Add a dm_filter_by_data_block (table="adsl", key_col="USUBJID") and a
patient_profile_block. Wire them:
- The global crossfilter feeds the dm_filter_by_data's "data" input.
- The AE waterfall chart from step 3 feeds the dm_filter_by_data's
  "by" input (its click emits a USUBJID-keyed data frame).
- The dm_filter_by_data feeds the patient_profile_block's "data" input.

For the patient_profile_block, set selected = ["patient_overview",
"ae_gantt", "blood_pressure"].
```

**Expected:** two new blocks (dm_filter_by_data, patient_profile),
three new links. dm_filter_by_data has TWO input slots: the usual
"data" (carrying the dm) plus "by" (carrying the click signal).

## 5. Two end-user views

```
Create two dock views for the dashboard user. No source blocks,
no intermediate transforms, no workflow graph in either view.

View 1 -- "Demographics":
  Two-column layout. Left column: the global crossfilter. Right
  column: the demographics gt table, full-height.

View 2 -- "Adverse Events":
  Two-column layout. Left column: the global crossfilter. Right
  column is a vertical split with the AE waterfall chart on top
  and the patient profile on the bottom -- so clicking a bar in
  the chart updates the profile underneath.

Make Demographics the active view when done.
```

**Expected:** two `add_view` calls with `exts_json=[]`:
- Demographics: `blocks_json=[<xf>, <gt>]`
- Adverse Events: `blocks_json=[<xf>, <chart>, <profile>]`

Followed by a `set_active_view` + `set_layout` per view:
- Demographics grid: `[["<xf>"], ["<gt>"]]` (two columns, one
  panel each)
- AE grid: `[["<xf>"], [["<chart>"], ["<profile>"]]]` (left
  column = filter; right column = vertical split of chart over
  profile)

Same crossfilter block instance appears in both views, so filtering
in one propagates to the other. The default "Page" view still
shows everything for builders.

---

## One-shot prompt (everything in one turn)

Use this if you want the model to build the whole dashboard in a
single turn instead of walking through prompts 1-5.

```
Build an interactive ADaM safety dashboard from the safetyData
example set. End audience is the dashboard user.

Source + global filter:
- dm_example_block loading "safetydata_adam"
- crossfilter_block downstream of the dm, active_dims for the adsl
  table on TRT01A, SEX, RACE. Every branch reads from this filtered
  dm, not the raw dm.

Each downstream block starts with a dm_pull_block reading FROM the
crossfilter (treat the crossfilter as the source -- do NOT add any
extra filter blocks between the crossfilter and the pulls).

Branch 1 -- demographics:
  dm_pull(adsl) -> summary_table(vars=[AGE, SEX, RACE, BMIBL],
  by=[TRT01A], stats="compact", add_overall=TRUE) -> gt_table

Branch 2 -- AE waterfall (patient-selecting chart):
  dm_pull(adae) -> drilldown_chart(chart_type="bar",
  group="USUBJID", metric=".count", agg_fn="count",
  sort_by="value", sort_dir="desc", drill="USUBJID", color="TRTA").
  Clicking a bar emits the clicked USUBJID downstream.

Branch 3 -- patient profile (driven by Branch 2's click):
  dm_filter_by_data_block(table="adsl", key_col="USUBJID"). It takes
  TWO inputs: the usual "data" carrying the dm, plus a "by" slot
  carrying the click signal.
    - add_link(from=<crossfilter id>, to=<filter id>, input="data")
    - add_link(from=<chart id>,        to=<filter id>, input="by")
  Then patient_profile_block(selected = ["patient_overview",
  "ae_gantt", "blood_pressure"]) reading from the dm_filter_by_data
  via input="data".

Two end-user views (no source blocks, no intermediate transforms,
no workflow graph in either):

View 1 -- "Demographics": two columns. Left = global crossfilter,
right = Table 1 gt table.

View 2 -- "Adverse Events": two columns. Left = global crossfilter.
Right = vertical split with the AE waterfall chart on top and the
patient profile on the bottom (so clicking a bar updates the
profile underneath).

Make Demographics the active view. The default "Page" view keeps
every block plus the dag for builders.

Set a meaningful block_name on every block at creation.
```

**Expected:** ~9 `add_block` + ~9 `add_link` calls in one flush
(note the dm_filter_by_data has TWO links: `data` from crossfilter
and `by` from the chart), followed by two `add_view` + two
`set_active_view` + two `set_layout` for the views.

---

## Diagnostics

If the model gets stuck mid-turn:

- `What blocks are on the board?` — invokes `list_blocks` /
  `describe_block`.
- `What views exist?` — invokes `get_views`.
- `What's in the active view?` — invokes `get_layout`.

Token cost reference (gpt-5.2, headless harness, prompt cached after
first turn): each step is roughly 200–1500 input tokens, 200–800
output tokens. One-shot run: ~25–35s, ~3k input / 600 output.
