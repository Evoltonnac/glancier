# Glancier View & Micro-Widget Architecture Specs

## Core Principles

The view layer of **Glancier** evolves towards a "low-code / configuration-driven" approach, adhering to the **Bento Grid** philosophy:

1. **Purely Display-Oriented**
   * **Scope Constraint:** All Micro-Widgets are **stateless information renderers**. Their mission is to map extracted **Integration Data** (Metrics & Signals) into visual elements.
   * **State Isolation:** Complex backend API states are stripped away. **API connectivity, loading states, and authentication anomalies must never be exposed as customizable properties.** The bottom-layer state is globally managed by the **Base Source Card** (or Bento Card) shell.

2. **Single Responsibility & Clear Boundaries**
   * Each micro-widget must do one thing well.
   * For example: "Key-value text", "Metric ring chart", and "Progress bar" are unrelated micro-widgets. Complex cards are assembled by **mounting multiple single-purpose micro-widgets in parallel**.
   * **Spacing/Margin Isolation:** Components must not contain external spacing. All spacing is handled by parent containers using `gap` or `space-y`.

3. **Evolution Over Creation & Strict Extension Review**
   * **Reuse is King:** Prioritize existing components.
   * **Mandatory Review Flow:** Topological changes (new Widget types or structural Schema changes) must be reviewed to prevent chaotic bloat.

4. **Framework & UI Library Agnostic**
   * Logic and Schema are decoupled from the underlying frontend implementation.

---

## Architecture Model: Bento Grid (Standard Shell + Micro-Slots)

The view layer is abstracted into: **`Base Source Card` (Bento Card) + `Widgets Slots`**.

**Dashboard-level layout:** View items (cards) are positioned on a grid. This enables a modular, organized "Bento Box" feel.

**Within a card:** Widgets use a flow layout. Optional `row_span` acts as a proportional weight for vertical space.

### 1. Base Source Card / Bento Card (Shell Specification)
Every integrated service is wrapped in this standard shell.
* **Fixed Elements:** Card Title, Logo/Icon, Refresh Timestamp.
* **Passive Interception:** Unified state rendering (Error, Auth Required) is handled by the shell, transparent to internal widgets.

### 2. Micro-Widgets Slots (Customization Layer)
The shell loads the `Widgets` array defined by YAML and sequentially assembles the visual building blocks.

---

## Micro-Widgets Library Reference

### Category A: Numeric & Cost Analytics (Metrics)
* **`hero_metric` (Core Highlighted Value)**
  * **Role:** Highlights a single core metric in a large font.
* **`trend_sparkline` (Minimalist Trend Line)**
  * **Role:** Illustrates stability or spikes without axes.

### Category B: Progress & Status (Signals)
* **`progress_bar` (formerly quota_bar)**
  * **Role:** Horizontal bar for comparing values against a limit.
  * **Core Config:** `usage`, `limit`, `color_thresholds`.
* **`gauge_ring` (Circular Dial)**
  * **Role:** Expresses percentages in compact vertical spaces.

### Category C: Details & Structural Helpers
* **`key_value_grid` (Attribute Grid)**
  * **Role:** Displays information that doesn't qualify for a chart.
* **`divider` (Visual Isolation)**
  * **Role:** Lightweight visual separator.

---

## YAML Configuration Example

```yaml
source_id: openai_prod_env_1
widgets:
  # Assembly 1: Metric Overview
  - type: hero_metric
    amount: "{data.financial.current_cost}"
    currency: "USD"

  # Assembly 2: Progress Tracking
  - type: progress_bar
    title: "{data.account.name} Limit (TPM)"
    usage: "{data.limits.tpm_used}"
    limit: "{data.limits.tpm_max}"
    color_thresholds:
      warning_percent: 80
      critical_percent: 95

  # Assembly 3: Auxiliary Signals
  - type: key_value_grid
    items:
      "Plan Tier": "{data.account.plan_type}"
      "Billing Cycle Ends": "{data.account.billing_end}"
```

## Template String Syntax

The view layer utilizes an evaluation protocol whereby any dynamic property strings enclosed in curly braces (e.g., `"{path}"` or `"Item: {path}"`) are evaluated at render time based on the active dataset context. The source layout definition acts as a pure structural map, entirely oblivious to the logic running behind the variables.

## Developer Code of Conduct

If you are a developer participating in the implementation of the view architecture, you must strictly perform the following self-reviews:

1. **Graceful Fallback Mechanism:** Configuration documents are not always perfect. If the YAML tells the micro-widget to read `data.limits.tpm_used`, but the actual API returns an empty value or `null`, **the component must degrade gracefully (e.g., displaying "--" or automatically folding away).** It is absolutely forbidden to trigger a frontend `TypeError` that causes the entire card to white screen!
2. **Pure Functional Extraction:** Micro-widget internals **strictly forbid housing any asynchronous (async/await) data-fetching code** or data-calculation interception logic. It should act like a static `dump` pure function: render exactly the values it is given.
