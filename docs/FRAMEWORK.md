# The Frontier Firm Framework

## Overview

The Frontier Firm Assessment measures an organisation's AI adoption maturity across four signals and classifies them into one of three maturity patterns.

## Four Signals

### Reach — "How well is it represented?"
Measures the breadth of AI adoption across the organisation.

Key metrics:
- **License Activation** — % of provisioned seats that are active
- **License Coverage** — % of total users who have a license
- **Regular User Rate** — % of users with 6+ active days
- **Agent Adoption Rate** — % of users interacting with agents
- **Portfolio Quality** — % of agents classified as high-impact
- **Org Penetration** — number of organisations with active usage

### Habit — "Is it sticking?"
Measures whether AI usage is becoming embedded in daily work.

Key metrics:
- **Licensed Habitual Rate** — % of licensed users with 11+ active days
- **Chat Habitual Rate** — % of unlicensed users with 11+ active days
- **Agent Habitual Rate** — agent users with 11+ active days
- **Agent Weekly Sessions** — sessions per user per week
- **3-Month Avg Retention** — average month-over-month retention across 3 months

### Skill — "Is it going deep?"
Measures the sophistication and depth of AI usage.

Key metrics:
- **Avg Apps per User** — distinct M365 surfaces used per person
- **Agents per User** — distinct agents used per person
- **Multi-Turn Sessions** — % of sessions with 2+ prompts
- **Agent Return Rate** — % of agents with returning users
- **Users Building Agents** — % of users who create agents

### Value — "Is it worth it?"
Measures the return on AI investment.

Key metrics:
- **Engagement Premium** — ratio of licensed vs unlicensed prompts per user

Value is excluded from pattern scoring but provides context on ROI.

## Three Maturity Patterns

### Pattern 1: Foundation
Early-stage adoption. Licenses are activated but usage is light and exploratory. Most users are in the 1-5 active days band. Agent adoption is minimal.

**Typical profile:** 3+ signals at Foundation tier.

### Pattern 2: Expansion
Growing adoption. Regular users are emerging, habits are forming across surfaces. Some organisations are pulling ahead. Agent ecosystem is developing.

**Typical profile:** 1-2 signals at Expansion or higher, rest at Foundation.

### Pattern 3: Frontier
Mature adoption. Deep, habitual usage across surfaces with measurable business value. Strong agent ecosystem with governance. High retention and cross-org penetration.

**Typical profile:** 3+ signals at Expansion or Frontier, with at least 1 at Frontier.

## How Signals Map to Patterns

Each metric is scored against bands defined in `schema/ff_schema.json`. Metrics aggregate up to signal tiers (Foundation, Expansion, Frontier). Signal tiers aggregate to the overall pattern.

Value is excluded from pattern determination but is scored and displayed independently.

See [SCORING.md](SCORING.md) for the detailed algorithm.
