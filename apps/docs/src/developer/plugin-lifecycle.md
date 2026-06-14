# Plugin Lifecycle

CAT treats plugins as runtime capabilities declared by a manifest and made available through a manager. A plugin can contribute services, UI components, routes, and activation hooks, but none of those contributions should be considered live until the activation phase has completed.

## Lifecycle

The lifecycle is intentionally split into discovery, registration, installation, activation, configuration reload, deactivation, and uninstallation.

Discovery and registration synchronize manifest and package metadata into durable plugin definitions. Installation creates the installation and configuration instance for a project or runtime scope; it records intent but does not make plugin code part of the active service graph. Activation is the boundary where executable plugin code is loaded and its capabilities become visible.

Activation follows a stable order:

1. Refresh the stored definition from the manifest.
2. Merge configuration defaults so hooks and services see a complete config shape.
3. Load the plugin entry module.
4. Run `onActivate` so the plugin can prepare dynamic capabilities.
5. Reconcile static manifest services, runtime dynamic services, and persisted service rows.
6. Register services, register components, and mount routes.

Deactivation must undo the runtime registrations for services, components, and routes. It is not just a flag flip; stale registry entries would otherwise keep disabled capabilities reachable.

## Design Intent

The manifest is the stable contract, while activation is the mutable runtime boundary. Keeping those concerns separate lets CAT discover and install plugins without executing arbitrary plugin code. It also allows configuration defaults to be merged before service registration, so consumers see the same service shape whether a service was declared statically or created dynamically during activation.

The trade-off is extra reconciliation work. The manager must keep the manifest, database records, and live registries aligned. That cost is deliberate because CAT needs plugin services to be queryable and inspectable while still supporting dynamic providers such as model gateways, vector storage, QA checkers, and rerankers.

## Runtime Registries

Service and component registries combine core contributions with active plugin contributions. Callers resolve capabilities through the combined registry rather than importing plugin code directly. That indirection keeps feature code plugin-first: a workflow can ask for a `TRANSLATION_ADVISOR`, `TEXT_VECTORIZER`, `VECTOR_STORAGE`, `QA_CHECKER`, or `RERANK_PROVIDER` without knowing which plugin supplies it.
