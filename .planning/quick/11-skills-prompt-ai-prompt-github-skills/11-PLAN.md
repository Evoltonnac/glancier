---
phase: quick
plan: 11
type: execute
wave: 1
depends_on: []
files_modified:
  - ui-react/src/constants/integrationSkillPrompt.ts
  - ui-react/src/pages/Integrations.tsx
  - ui-react/src/pages/Integrations.test.tsx
  - skills/README.md
  - .planning/quick/11-skills-prompt-ai-prompt-github-skills/11-SUMMARY.md
  - .planning/STATE.md
autonomous: true
requirements: []
---

<objective>
Bundle the canonical skills prompt into the client bundle, then add an AI sparkles entry point in the integration-creation dialog that switches to a dedicated modal with two actions: copy full prompt and open the GitHub skills directory.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Bundle skills prompt into a frontend project file</name>
  <files>skills/PROMPT.md, ui-react/src/constants/integrationSkillPrompt.ts</files>
  <action>
Generate a TypeScript constant that contains the full prompt text from `skills/PROMPT.md` so the client can copy prompt content without runtime file-system dependency.
  </action>
  <verify>
    <manual>Confirm the exported constant includes the full prompt heading and content.</manual>
  </verify>
  <done>Client code can import one constant and obtain the complete prompt.</done>
</task>

<task type="auto">
  <name>Task 2: Add AI sparkles flow in integration create dialog</name>
  <files>ui-react/src/pages/Integrations.tsx, ui-react/src/pages/Integrations.test.tsx</files>
  <action>
Add a vivid icon-only AI button (sparkles) in the new integration dialog. Clicking it should replace dialog content with an AI helper modal that offers two actions: copy full prompt and open the GitHub `skills` folder URL. Add/adjust tests for this flow.
  </action>
  <verify>
    <manual>Run `npm --prefix ui-react test -- src/pages/Integrations.test.tsx`.</manual>
  </verify>
  <done>Dialog interaction works and is covered by frontend test assertions.</done>
</task>

<task type="auto">
  <name>Task 3: Add skills README and record quick-task artifacts</name>
  <files>skills/README.md, .planning/quick/11-skills-prompt-ai-prompt-github-skills/11-SUMMARY.md, .planning/STATE.md</files>
  <action>
Create `skills/README.md` describing how to use the integration-editor skill and prompt. Then document execution summary and update STATE quick-task metadata.
  </action>
  <verify>
    <manual>Ensure README exists and STATE quick-task row references task 11 directory.</manual>
  </verify>
  <done>Users have in-repo guidance and GSD state tracking is up to date.</done>
</task>

</tasks>

<success_criteria>
- Client bundle contains the full `skills/PROMPT.md` content via a TS export
- Integration create dialog includes icon-only AI sparkles button with bright styling
- AI dialog view offers exactly two actions (copy prompt, open GitHub skills folder)
- `skills/README.md` exists and provides usage guidance
- Frontend impacted test passes
</success_criteria>

<output>
After completion, create .planning/quick/11-skills-prompt-ai-prompt-github-skills/11-SUMMARY.md
</output>
