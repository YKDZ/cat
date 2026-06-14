# VCS Branch Isolation

CAT uses a built-in VCS model so draft work can be isolated from approved translations. The central unit is a changeset: an ordered collection of entity changes attached to a branch. A branch can operate directly on mainline data or isolate its changes in changesets.

## Branch Modes

Direct branches write accepted changes to the main data store. Isolation branches store draft edits as changeset entries, which makes them suitable for automatic translation proposals, review workspaces, and pull-request-like flows.

The important distinction is visibility. Direct changes are immediately part of the main project state. Isolation changes are only visible when a reader asks for that branch workspace.

## Overlay Reads

Isolated branch reads are overlay reads. The reader starts with the current mainline entity snapshot, loads the branch history from its fork point, replays changeset entries in order, and returns the overlaid result. The frontend can then display draft translations, review candidates, or ghost text without mutating the approved baseline.

This design avoids copying whole project state into each branch. The trade-off is that readers must be branch-aware; a code path that ignores branch identity will see only mainline state and may miss draft work.

## Merge And Conflict Semantics

Conflict detection compares changes made on two branches since their common ancestor. The conflict identity is semantic rather than file-based: two entries conflict when they touch the same entity type and entity id.

Merge applies the source branch changes into a target branch or mainline according to the selected strategy. A target can keep its current value, accept the source value, or require manual resolution. Rebase moves an isolated branch onto a newer base and replays its changes, skipping changes that are already equivalent on the new base.

Entity-specific diff and apply strategies matter because translations, elements, and other records do not all merge the same way. CAT keeps that behavior behind strategy registries so changeset replay preserves domain semantics instead of treating every payload as an opaque blob.
