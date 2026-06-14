# Automatic Translation

Automatic translation has two related paths: choosing the best candidate for one element and running a batch pre-translation pipeline that writes isolated branch changes.

## Candidate Selection

Candidate selection compares translation memory recall with advisor output. Memory is preferred when a strong reusable translation exists because it is grounded in prior approved work. The advisor path packages terms, memory hints, and element metadata for a `TRANSLATION_ADVISOR` plugin when memory alone is not enough.

The selector is intentionally small. It chooses a candidate; it does not decide project workflow, branch policy, or review state.

## Single-Element Write

The single-element operation takes the selected suggestion and creates a translation for that element. It is useful for direct assistive actions, but it is not the pull-request pipeline. Keeping it narrow prevents one helper from owning too much workflow state.

## Batch Pipeline

The batch pipeline checks whether automatic translation is enabled, selects target languages, finds or creates an auto-translation branch, and writes suggestions as `auto_translation` changeset entries. Those entries live in an isolated VCS branch so pre-translation can be reviewed before it affects mainline translations.

This design trades immediate write simplicity for reviewability. Automatic translation can produce useful coverage quickly, but its output should remain distinguishable from human-approved translation until review accepts it.

## Provider Boundaries

Providers are plugin services. The operations layer assembles the context and handles persistence; the `TRANSLATION_ADVISOR` supplies suggestions. When plugin-backed advice is unavailable or invalid, automatic translation should degrade gracefully rather than block the rest of the project workflow. Traceable candidate selection is more valuable than forcing every project to have the same model provider.
