
## The Core Principle

> **Only surface commands that are both *possible* and *probable* right now.**

That means prioritization should be driven by:

1. **What the user is doing**
2. **What they just said**
3. **What state the editor is in**
4. **What would be most costly to get wrong**

---

## 1. Define a Small Set of Context Signals (Your Ranking Inputs)

Instead of “editor context” as one thing, break it into **explicit signals**. For Mutter, these might be:

### A. Cursor / Selection State (highest weight)

* No selection
* Inline selection
* Block selection
* Multiple blocks selected
* Cursor in:

  * heading
  * list
  * task
  * code block
  * graph/canvas

**Why it matters:**
Commands that operate on *selection* should outrank everything else when selection exists.

> If something is selected, users usually want to **act on it**, not navigate away.

---

### B. Voice Session State

Think of voice mode as having *phases*:

1. **Listening (idle)**
2. **Command recognized**
3. **Command ambiguous**
4. **Command executed**
5. **Awaiting confirmation**
6. **Undo window**

Each phase limits what should appear.

Example:

* After a command executes → surface **Undo / Refine / Repeat**
* After ambiguity → surface **Clarify / Choose / Cancel**
* During dictation → surface **Formatting / Stop dictation**

---

### C. Recent Intent History (last 2–3 actions)

Users tend to stay in the same *intent cluster*.

If the last actions were:

* formatting → suggest formatting
* navigation → suggest navigation
* linking → suggest linking

This can be a simple rolling window, not ML.

---

### D. Document Mode / View Mode

Examples:

* Markdown editor
* Outline view
* Graph view
* Canvas

Each mode has a **whitelist** of relevant commands.

> Don’t just rank — *hard exclude* irrelevant ones.

---

## 2. Organize Commands Into Intent Buckets (Not a Flat List)

Before ranking, group commands into **semantic buckets**:

* **Edit Selection**
* **Format Text**
* **Structure Document**
* **Navigate**
* **Link / Reference**
* **Query / Ask AI**
* **Meta (undo, help, cancel)**

Each bucket gets a **base priority per context**.

Example base priorities:

| Context         | Top Buckets           |
| --------------- | --------------------- |
| Text selected   | Edit → Format → Link  |
| Cursor idle     | Dictation → Structure |
| Graph view      | Navigate → Query      |
| After execution | Undo → Refine         |

---

## 3. Scoring Model (Simple, Deterministic)

You do *not* need ML here. A weighted score works beautifully.

### Example scoring formula

```ts
score =
  contextRelevance * 0.4 +
  recentIntentMatch * 0.25 +
  voicePhaseMatch * 0.2 +
  commandCostWeight * 0.1 +
  userAffinity * 0.05
```

Where:

* `contextRelevance`: selection + block type match
* `recentIntentMatch`: same bucket as last command
* `voicePhaseMatch`: allowed in this voice phase
* `commandCostWeight`: destructive = lower unless explicit
* `userAffinity`: learned later (optional)

Then:

* Show **top 3–5 max**
* Everything else stays hidden behind “More” or “Help”

---

## 4. Visual Hierarchy: Don’t Treat All Suggestions Equally

Once ranked, *presentation* matters as much as logic.

### Tiered suggestion display

**Tier 1 — Primary (1–2 items)**

* Large
* Centered near cursor or waveform
* Explicit verbs

  > “Bold selection”
  > “Create link”

**Tier 2 — Secondary (2–3 items)**

* Smaller
* Subtle
* Often refinements

  > “Italicize”
  > “Turn into heading”

**Tier 3 — Escape / Meta**

* Always visible but subdued

  > “Undo”
  > “Cancel”
  > “Help”

> If everything looks equally clickable, nothing feels safe.

---

## 5. Confirmation UI: Prioritize Risk, Not Frequency

Confirmations should **only interrupt** when:

* The action is destructive
* The command was ambiguous
* The scope is large (multiple blocks)

### Confirmation prioritization rule

| Action Type      | Confirmation UI       |
| ---------------- | --------------------- |
| Formatting       | Inline toast          |
| Single edit      | Subtle text + Undo    |
| Multi-block      | Explicit confirmation |
| Delete / Archive | Strong confirmation   |

And **confirmations should displace suggestions**, not stack on top of them.

> When confirmation is active, suggestions collapse to *Undo / Cancel / Confirm* only.

---

## 6. Progressive Disclosure Over Time

Early users:

* Show **fewer**, safer commands
* Bias toward reversible actions

Experienced users:

* Increase command breadth
* Reduce confirmations
* Promote advanced commands earlier

This can be driven by:

* Successful usage count
* Undo frequency
* Time in voice mode

---

## 7. One Crucial Anti-Pattern to Avoid

❌ **Never show commands the system can’t currently execute**

Even if they’re “helpful.”

This breaks trust *fast* in voice mode.

If the user sees:

> “Create link”

…and it fails because nothing is selected, they’ll blame voice — not context.

---

## TL;DR Mental Model

Think of Mutter’s voice suggestions as:

> **A spotlight, not a menu**

The spotlight:

* Moves with context
* Narrows aggressively
* Highlights intent, not capability
* Always leaves an escape hatch (Undo / Cancel)
