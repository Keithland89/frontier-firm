# Insight Generation Request

Read `temp/insights_request.json` for the customer data and metrics.

Generate the `_ai_insights` object with all 30 keys listed in the request.
Merge it into the data JSON file and save.

## Quality Rules
- Simple language — written for a non-technical executive
- Every claim backed by a specific number from the data
- Each insight answers "so what?"
- Recommendations are specific — name cohorts, orgs, targets
- "Habitual" = 11+ active days/month — never say "daily" unless 20+
- No contradictions between sections
- No generic insights that could apply to any customer

## After saving insights, re-run:
```
node src/run-pipeline.js --data data/{customer}.json --output output/
```
