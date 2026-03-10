# Two Lanes Scorecard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the scorecard as a 2-lane (Copilot × Agents) × 3-pillar (Skill, Consistency, Reach) grid with 13 metrics, and restructure the report to drill into each lane's evidence.

**Architecture:** New v4 schema defines the 2×3 grid. The V3 template gets a new scorecard visual (2×3 grid with clickable cells) replacing the current flat 11-metric list. Generator builds the grid HTML dynamically from the schema. Deep-dive sections reorganised by lane (Copilot evidence, Agent evidence) rather than by signal.

**Tech Stack:** Node.js, Chart.js 4, HTML/CSS dark mode, ff_schema_v2.json → ff_schema_v4.json

---

### Task 1: Create v4 Schema

**Files:**
- Create: `schema/ff_schema_v4.json`

**Step 1: Write the schema**

Two lanes, three pillars, 13 metrics:

```json
{
  "$schema": "Frontier Firm Scorecard v4 — Two Lanes × Three Pillars",
  "lanes": {
    "copilot": {
      "label": "M365 Copilot",
      "color": "#2264E5",
      "description": "Individual AI productivity — is Copilot becoming part of how people work?"
    },
    "agents": {
      "label": "Agents",
      "color": "#7B2FF2",
      "description": "Team-level AI — are agents embedded in real workflows?"
    }
  },
  "pillars": {
    "skill": {
      "label": "Skill",
      "question": "Are they going deep?",
      "color_accent": "#0EA5E9"
    },
    "consistency": {
      "label": "Consistency",
      "question": "Is it sticking?",
      "color_accent": "#F59E0B"
    },
    "reach": {
      "label": "Reach",
      "question": "Is it spreading?",
      "color_accent": "#10B981"
    }
  },
  "metrics": {
    "copilot_app_breadth":    { "lane": "copilot", "pillar": "skill",       "name": "App Surface Breadth",   "unit": "apps/user",    "bands": [3, 5],    "data_field": "m365_breadth" },
    "copilot_multiturn":      { "lane": "copilot", "pillar": "skill",       "name": "Multi-Turn Rate",       "unit": "%",            "bands": [40, 70],   "data_field": "complex_sessions" },
    "copilot_habitual":       { "lane": "copilot", "pillar": "consistency",  "name": "Habitual User Rate",    "unit": "%",            "bands": [15, 35],   "data_field": "embedded_user_rate" },
    "copilot_retention":      { "lane": "copilot", "pillar": "consistency",  "name": "MoM Retention",         "unit": "%",            "bands": [75, 90],   "data_field": "m365_retention" },
    "copilot_activation":     { "lane": "copilot", "pillar": "reach",       "name": "License Activation",    "unit": "%",            "bands": [60, 85],   "data_field": "m365_enablement" },
    "copilot_coverage":       { "lane": "copilot", "pillar": "reach",       "name": "License Coverage",      "unit": "%",            "bands": [30, 60],   "data_field": "license_coverage" },
    "copilot_concentration":  { "lane": "copilot", "pillar": "reach",       "name": "Concentration Index",   "unit": "%",            "bands": [40, 70],   "data_field": "concentration_index" },
    "agent_breadth":          { "lane": "agents",  "pillar": "skill",       "name": "Agent Breadth",         "unit": "agents/user",  "bands": [2, 4],     "data_field": "agent_breadth" },
    "agent_return":           { "lane": "agents",  "pillar": "skill",       "name": "Agent Return Rate",     "unit": "%",            "bands": [50, 80],   "data_field": "agent_health" },
    "agent_habitual":         { "lane": "agents",  "pillar": "consistency",  "name": "Agent Habitual Rate",   "unit": "%",            "bands": [5, 15],    "data_field": "agent_habitual_rate" },
    "agent_retention":        { "lane": "agents",  "pillar": "consistency",  "name": "Agent MoM Retention",   "unit": "%",            "bands": [50, 75],   "data_field": "agent_retention" },
    "agent_adoption":         { "lane": "agents",  "pillar": "reach",       "name": "Agent Adoption",        "unit": "%",            "bands": [10, 25],   "data_field": "agent_adoption" },
    "agent_org_penetration":  { "lane": "agents",  "pillar": "reach",       "name": "Org Penetration",       "unit": "%",            "bands": [20, 50],   "data_field": "org_penetration_pct" }
  },
  "pattern_rules": {
    "pillar_tier": "Weakest metric in the pillar (all must be Expansion+ for pillar to be Expansion)",
    "lane_tier": "Weakest pillar in the lane",
    "overall_pattern": "The weaker lane determines overall pattern",
    "p1_foundation": "Either lane at Foundation",
    "p2_expansion": "Both lanes at Expansion+, at most one at Frontier",
    "p3_frontier": "Both lanes at Frontier"
  }
}
```

**Step 2: Commit**
```bash
git add schema/ff_schema_v4.json
git commit -m "feat: v4 schema — Two Lanes × Three Pillars, 13 metrics"
```

---

### Task 2: Build Scorecard Grid in Generator

**Files:**
- Modify: `src/generate-report.js`

**Step 1: Load v4 schema alongside existing**

After the v2 schema loading (around line 52):
```javascript
const schemaV4Path = path.resolve(__dirname, '..', 'schema', 'ff_schema_v4.json');
const schemaV4 = fs.existsSync(schemaV4Path) ? JSON.parse(fs.readFileSync(schemaV4Path, 'utf8')) : null;
```

**Step 2: Add v4 scoring engine**

After the v2 scoring block:
```javascript
// V4 Two Lanes scoring
let v4Tiers = {};  // per-metric tiers
let v4PillarTiers = {};  // per-lane-per-pillar
let v4LaneTiers = {};  // per-lane
let v4Pattern = null;

if (schemaV4) {
  // Score each metric
  for (const [id, m] of Object.entries(schemaV4.metrics)) {
    const val = data[m.data_field];
    if (typeof val !== 'number') { v4Tiers[id] = 'Foundation'; continue; }
    v4Tiers[id] = val >= m.bands[1] ? 'Frontier' : val >= m.bands[0] ? 'Expansion' : 'Foundation';
  }

  // Score each pillar per lane (weakest metric = pillar tier)
  for (const lane of Object.keys(schemaV4.lanes)) {
    v4PillarTiers[lane] = {};
    for (const pillar of Object.keys(schemaV4.pillars)) {
      const metrics = Object.entries(schemaV4.metrics)
        .filter(([_, m]) => m.lane === lane && m.pillar === pillar);
      const tiers = metrics.map(([id]) => v4Tiers[id]);
      // Weakest metric determines pillar
      if (tiers.includes('Foundation')) v4PillarTiers[lane][pillar] = 'Foundation';
      else if (tiers.includes('Expansion')) v4PillarTiers[lane][pillar] = 'Expansion';
      else v4PillarTiers[lane][pillar] = 'Frontier';
    }
  }

  // Lane tier = weakest pillar
  for (const lane of Object.keys(schemaV4.lanes)) {
    const pillars = Object.values(v4PillarTiers[lane]);
    if (pillars.includes('Foundation')) v4LaneTiers[lane] = 'Foundation';
    else if (pillars.includes('Expansion')) v4LaneTiers[lane] = 'Expansion';
    else v4LaneTiers[lane] = 'Frontier';
  }

  // Overall pattern = weaker lane
  const lanes = Object.values(v4LaneTiers);
  if (lanes.includes('Foundation')) v4Pattern = { number: 1, name: 'Foundation' };
  else if (lanes.every(t => t === 'Frontier')) v4Pattern = { number: 3, name: 'Frontier' };
  else v4Pattern = { number: 2, name: 'Expansion' };

  // Override main pattern with v4
  pattern.number = v4Pattern.number;
  pattern.name = v4Pattern.name;
}
```

**Step 3: Build the 2×3 grid HTML**

Replace the `V2_SCORECARD_HTML` builder with a new `V4_SCORECARD_HTML` builder:

```javascript
// Build 2×3 grid scorecard
let gridHtml = '';
if (schemaV4) {
  const tierBg = t => t === 'Frontier' ? 'rgba(16,185,129,.15)' : t === 'Expansion' ? 'rgba(245,158,11,.15)' : 'rgba(100,116,139,.15)';
  const tierColor = t => t === 'Frontier' ? '#10B981' : t === 'Expansion' ? '#F59E0B' : '#94A3B8';

  // Header row
  gridHtml += '<div style="display:grid;grid-template-columns:120px repeat(3,1fr);gap:2px;margin-top:2rem">';
  gridHtml += '<div></div>'; // empty corner
  for (const [pKey, pDef] of Object.entries(schemaV4.pillars)) {
    gridHtml += '<div style="text-align:center;padding:.75rem .5rem;background:rgba(255,255,255,.03);border-radius:8px 8px 0 0">';
    gridHtml += '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:' + pDef.color_accent + '">' + pDef.label + '</div>';
    gridHtml += '<div style="font-size:.55rem;color:rgba(255,255,255,.4);margin-top:.2rem">' + pDef.question + '</div>';
    gridHtml += '</div>';
  }

  // Lane rows
  for (const [lKey, lDef] of Object.entries(schemaV4.lanes)) {
    // Lane label
    gridHtml += '<div style="display:flex;flex-direction:column;justify-content:center;padding:.75rem;background:rgba(255,255,255,.02);border-radius:8px 0 0 8px">';
    gridHtml += '<div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:' + lDef.color + '">' + lDef.label + '</div>';
    gridHtml += '<div style="margin-top:.4rem;padding:.15rem .5rem;border-radius:100px;font-size:.55rem;font-weight:700;display:inline-block;background:' + tierBg(v4LaneTiers[lKey]) + ';color:' + tierColor(v4LaneTiers[lKey]) + '">' + v4LaneTiers[lKey] + '</div>';
    gridHtml += '</div>';

    // Pillar cells
    for (const [pKey, pDef] of Object.entries(schemaV4.pillars)) {
      const pillarTier = v4PillarTiers[lKey][pKey];
      const cellMetrics = Object.entries(schemaV4.metrics)
        .filter(([_, m]) => m.lane === lKey && m.pillar === pKey);

      // Deep-dive link target
      const linkTarget = lKey === 'copilot' ? '#reach' : '#skill'; // Copilot→Reach section, Agents→Skill section

      gridHtml += '<a href="' + linkTarget + '" style="text-decoration:none;display:block;padding:.75rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;transition:all .3s;cursor:pointer" onmouseover="this.style.background=\'rgba(255,255,255,.07)\'" onmouseout="this.style.background=\'rgba(255,255,255,.03)\'">';

      // Pillar tier badge
      gridHtml += '<div style="text-align:right;margin-bottom:.5rem"><span style="padding:.12rem .4rem;border-radius:100px;font-size:.5rem;font-weight:700;background:' + tierBg(pillarTier) + ';color:' + tierColor(pillarTier) + '">' + pillarTier + '</span></div>';

      // Metrics in this cell
      cellMetrics.forEach(([mId, mDef]) => {
        const val = data[mDef.data_field];
        const display = typeof val === 'number' ? (Number.isInteger(val) ? String(val) : String(Math.round(val * 10) / 10)) : '—';
        const mTier = v4Tiers[mId];
        gridHtml += '<div style="margin-bottom:.4rem">';
        gridHtml += '<div style="font-size:.5rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:rgba(255,255,255,.4)">' + mDef.name + '</div>';
        gridHtml += '<div style="font-size:1rem;font-weight:800;color:' + tierColor(mTier) + '">' + display + (mDef.unit === '%' ? '%' : '') + '</div>';
        gridHtml += '</div>';
      });

      gridHtml += '</a>';
    }
  }
  gridHtml += '</div>';
}
html = html.replace(/\{\{V4_SCORECARD_HTML\}\}/g, gridHtml || '');
// Also replace old V2 scorecard if template still has it
html = html.replace(/\{\{V2_SCORECARD_HTML\}\}/g, gridHtml || '');
```

**Step 4: Commit**
```bash
git add src/generate-report.js schema/ff_schema_v4.json
git commit -m "feat: v4 scoring engine + 2×3 grid scorecard builder"
```

---

### Task 3: Update Template Scorecard Section

**Files:**
- Modify: `template/ff_template_v3.html`

**Step 1: Replace the scorecard block in the Maturity Assessment**

Find the current scorecard heading ("Scorecard — 11 Metrics · 3 Signals") and the `{{V2_SCORECARD_HTML}}` placeholder. Replace with:

```html
<!-- Two Lanes Scorecard -->
<div style="margin-top:2rem" class="reveal reveal-d4">
  <div style="display:flex;align-items:baseline;gap:1rem;margin-bottom:.5rem">
    <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.5)">Scorecard</div>
    <div style="font-size:.6rem;color:rgba(255,255,255,.3)">Click any cell to see the evidence</div>
  </div>
  {{V4_SCORECARD_HTML}}
</div>
```

**Step 2: Update signal navigation pills**

Replace the existing Reach/Habit/Skill navigation pills with lane-aware ones:
```html
<div style="display:flex;gap:1rem;margin:1.5rem 0;justify-content:center;flex-wrap:wrap" class="reveal reveal-d5">
  <a href="#reach" style="text-decoration:none;padding:.4rem 1rem;border-radius:100px;font-size:.65rem;font-weight:700;border:1px solid rgba(34,100,229,.3);color:#2264E5;background:rgba(34,100,229,.06)">Copilot Evidence →</a>
  <a href="#skill" style="text-decoration:none;padding:.4rem 1rem;border-radius:100px;font-size:.65rem;font-weight:700;border:1px solid rgba(123,47,242,.3);color:#7B2FF2;background:rgba(123,47,242,.06)">Agent Evidence →</a>
  <a href="#value" style="text-decoration:none;padding:.4rem 1rem;border-radius:100px;font-size:.65rem;font-weight:700;border:1px solid rgba(16,185,129,.3);color:#10B981;background:rgba(16,185,129,.06)">License Intelligence →</a>
</div>
```

**Step 3: Commit**
```bash
git add template/ff_template_v3.html
git commit -m "feat: v4 2×3 grid scorecard in template"
```

---

### Task 4: Add Concentration Index to Data

**Files:**
- Modify: `src/generate-report.js`
- Modify: `data/ff_example_full.json`

**Step 1: Compute concentration_index from org scatter data**

In the generator, after org scatter processing:
```javascript
// Concentration Index — % of orgs above median usage
if (orgScatter.length > 0) {
  const usages = orgScatter.map(o => o.x).sort((a, b) => a - b);
  const median = usages[Math.floor(usages.length / 2)];
  const aboveMedian = usages.filter(u => u >= median).length;
  data.concentration_index = Math.round(aboveMedian / usages.length * 100);
} else {
  data.concentration_index = data.concentration_index || 0;
}
```

**Step 2: Add to FF Example data as fallback**
```json
"concentration_index": 50
```

**Step 3: Commit**
```bash
git add src/generate-report.js data/ff_example_full.json
git commit -m "feat: compute concentration_index from org scatter"
```

---

### Task 5: Test and Verify

**Step 1: Generate report**
```bash
node src/generate-report.js --data data/ff_example_full.json --output output/ --no-ai --v3
```

**Step 2: Verify**
- 0 leftover placeholders
- 2×3 grid renders with correct tiers
- Each cell shows 2-3 metrics with values
- Clicking a cell navigates to the deep-dive
- Pattern determined by weaker lane
- All existing charts still render

**Step 3: Open and visual check**
```bash
start "" output/ff_example_frontier_firm.html
```

**Step 4: Commit**
```bash
git add -A
git commit -m "feat: Two Lanes scorecard — complete implementation"
git push origin master
```

---

## Execution Order

Tasks 1-4 are sequential (each builds on the previous).
Task 5 is verification.

Total: ~5 tasks, each 5-10 minutes.
