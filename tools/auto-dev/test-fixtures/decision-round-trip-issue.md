## Task

Create a new file `tools/auto-dev/docs/test-decision-log.md` that documents user decisions collected via the `auto-dev request-decision` tool.

You MUST follow the two-round decision collection process described below. Use the **Run ID** from the `## Metadata` section as the value of `--workflow-run-id` in every call.

---

## Round 1 — Collect exactly 2 decisions before doing any other work

Call `auto-dev request-decision` for **Decision A**, wait for the response, then call it for **Decision B**, and wait for the response.

**Decision A** — Document title style:

```bash
auto-dev request-decision \
  --workflow-run-id <RUN_ID> \
  --title "Document title style" \
  --options '[{"key":"formal","label":"Formal Report","description":"Title: User Decision Report"},{"key":"casual","label":"Casual Log","description":"Title: My Decisions"},{"key":"technical","label":"Technical Record","description":"Title: Decision Audit Log"}]' \
  --recommendation "formal"
```

**Decision B** — Target audience:

```bash
auto-dev request-decision \
  --workflow-run-id <RUN_ID> \
  --title "Target audience for the document" \
  --options '[{"key":"dev","label":"Developers","description":"Technical jargon acceptable"},{"key":"pm","label":"Project Managers","description":"Business language preferred"},{"key":"both","label":"All stakeholders","description":"Plain language, no jargon"}]' \
  --recommendation "both"
```

After both responses arrive, report your phase and proceed to Round 2.

---

## Round 2 — Collect exactly 3 more decisions before writing the file

Call `auto-dev request-decision` for **Decision C**, **D**, **E** in sequence, waiting for each response before calling the next.

**Decision C** — Include timestamps:

```bash
auto-dev request-decision \
  --workflow-run-id <RUN_ID> \
  --title "Should each decision entry include a timestamp?" \
  --options '[{"key":"yes","label":"Yes — include ISO timestamps","description":"Add requestedAt timestamp to each entry"},{"key":"no","label":"No — omit timestamps","description":"Keep the document concise"}]' \
  --recommendation "yes"
```

**Decision D** — Show original recommendation:

```bash
auto-dev request-decision \
  --workflow-run-id <RUN_ID> \
  --title "Should entries show the original recommendation vs the user choice?" \
  --options '[{"key":"yes","label":"Yes — show recommendation","description":"Show what was recommended and whether user agreed"},{"key":"no","label":"No — only final choice","description":"Only show what the user decided"}]' \
  --recommendation "yes"
```

**Decision E** — Sort order:

```bash
auto-dev request-decision \
  --workflow-run-id <RUN_ID> \
  --title "How should decisions be ordered in the document?" \
  --options '[{"key":"chronological","label":"Chronological","description":"In the order they were requested (A B C D E)"},{"key":"importance","label":"By importance","description":"Most impactful decisions first"},{"key":"round","label":"By collection round","description":"Round 1 decisions first, then Round 2"}]' \
  --recommendation "round"
```

---

## Document Content

After collecting all 5 decisions, create `tools/auto-dev/docs/test-decision-log.md` with the following content:

1. **Header** — Use the title style chosen in Decision A:
   - `formal` → `# User Decision Report`
   - `casual` → `# My Decisions`
   - `technical` → `# Decision Audit Log`

2. **Metadata block** — State the target audience from Decision B verbatim:

   ```
   > **Target audience**: <chosen option label from Decision B>
   ```

3. **Decisions section** — A table or list containing all 5 decisions, each entry with:
   - Decision title (verbatim from the `--title` parameter)
   - Chosen option key and label (verbatim)
   - If Decision C = `yes`: include the `requestedAt` timestamp from the response JSON
   - If Decision D = `yes`: include a "Recommendation" column showing the recommended key and whether the user agreed

4. **Summary** — A closing prose paragraph titled `## Summary of User Choices` that restates in plain language what the user decided across both rounds. Use direct quotes from the option labels (e.g., `"Formal Report"`, `"All stakeholders"`).

After creating the file, commit and push.
