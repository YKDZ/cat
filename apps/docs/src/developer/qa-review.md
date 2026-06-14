# QA Review

QA review turns translation quality checks into durable findings, queue items, annotations, and reviewer decisions. The runtime pipeline detects issues; the review workflow manages human resolution.

## QA Pipeline

The QA pipeline loads translation context, tokenizes source and translation text, recalls matched glossary terms, and runs every active `QA_CHECKER` service. A checker receives tokenized source, tokenized translation, and matched terms, then returns issues. If no checker reports an issue, CAT records an explicit pass result so later consumers can distinguish "checked and clean" from "not checked".

The default checker behavior demonstrates the plugin boundary with concrete rules such as number consistency and variable consistency. More checkers can be added without changing the review workflow.

## Review Queue

Findings are materialized into review queue items so reviewers work from stable units instead of raw transient checker output. Queue items track activity, unresolved counts, assignment, and state. This keeps the workbench resilient when QA is rerun or when multiple reviewers inspect the same translation.

Annotations capture concrete issue instances under a queue item. Suggestions can then be accepted, rejected, deferred, or marked applied. Decision commands use optimistic concurrency so stale workbench state cannot silently overwrite a newer review action.

## Decision Semantics

A reviewer decision closes or advances findings and annotations according to an explicit state machine. Blocking issues may require an override reason before approval can continue. Non-blocking issues can be deferred so review progress is not halted by every warning.

The trade-off is more state than a simple pass/fail flag, but the extra state is what lets CAT support review queues, auditability, and partial resolution while keeping automatic checks plugin-driven.
