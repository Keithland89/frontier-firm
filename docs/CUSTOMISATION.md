# Customisation Guide

## Adding a New Metric

1. **Add to schema** — edit `schema/ff_schema.json`:
   ```json
   "new_metric": {
     "name": "Display Name",
     "unit": "% or count or ratio",
     "bands": [low, mid, high],
     "band_labels": ["Foundation", "Foundation", "Expansion", "Frontier"],
     "signal": "reach|habit|skill|value"
   }
   ```

2. **Add to signal** — include the metric ID in the signal's `metrics` array

3. **Add to data file** — include the value in customer JSON files

4. **Update template** — add a `{{PLACEHOLDER}}` in `template/ff_template.html` if it needs to appear visually

5. **Update generator** — add the placeholder replacement in `src/generate-report.js`

## Adjusting Scoring Bands

Edit the `bands` array in `schema/ff_schema.json`. The three values represent:
- `bands[0]` — threshold between low Foundation and high Foundation
- `bands[1]` — threshold for Expansion
- `bands[2]` — threshold for Frontier

Percentage metrics stored as 0-100 (e.g. 75.4%) use bands in 0-1 scale (e.g. [0.40, 0.70, 0.90]).

Metrics stored as raw small values (e.g. agent_creators_pct = 4.7) use integer-scale bands (e.g. [2, 5, 10]).

## Excluding a Metric from Scoring

Set `"scored": false` on the metric. It will still appear in the report but won't affect signal tiers.

## Excluding a Signal from Pattern Scoring

Set `"exclude_from_pattern": true` on the signal (as Value currently has). The signal is scored and displayed but doesn't affect the overall pattern.

## Modifying the Template

The template (`template/ff_template.html`) uses `{{PLACEHOLDER}}` tokens. The generator replaces these at build time.

To add a new section:
1. Add HTML with `{{NEW_PLACEHOLDER}}` tokens in the template
2. Add the replacement logic in `generate-report.js`
3. Add the data fields to the extraction prompts

## Changing the Visual Theme

The template uses CSS custom properties. Key variables are defined in the `<style>` block. The report is dark mode only by design.

## Adding Organisation-Specific Data

The `org_scatter_data` array supports any number of organisations. Each needs:
- `label` — display name
- `x` — user count (horizontal axis)
- `y` — agent adoption % (vertical axis)
- `r` — session count (bubble size)

If org data is unavailable, the scatter chart section can be hidden.

## Using Pattern Overrides

If the algorithmic scoring doesn't match expert assessment, add overrides to the data file:

```json
{
  "pattern": 2,
  "pattern_name": "Expansion",
  "reach_tier": "Expansion",
  "habit_tier": "Foundation"
}
```

Overrides take precedence over calculated values.
