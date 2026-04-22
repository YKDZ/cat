---
subject: infra/plugin-core
title: 插件生命周期
---

`@/workspaces/cat/packages/plugin-core/src/entities/plugin.ts:L57-L95` 先定义插件契约：`services`、`components`、`routes`、`onActivate`、`onDeactivate`。

`@/workspaces/cat/packages/plugin-core/src/registry/plugin-discovery.ts:L8-L63` 负责把文件系统中的 manifest / package metadata 同步进数据库 definition。

`@/workspaces/cat/packages/plugin-core/src/registry/loader.ts:L18-L122` 负责读取 `manifest.json`、`package.json`、`README.md` 并动态 import entry default export。

`@/workspaces/cat/packages/plugin-core/src/registry/plugin-manager.ts:L52-L58` 给出完整生命周期顺序：Discovery → Registration → Installation → Activation → (ConfigReload) → Deactivation → Uninstallation。

各阶段职责：

- `install()` (`L179-L201`) 只写 installation/config instance；
- `activate()` (`L245-L316`) 依次执行 ensureDefinitionSynced → mergeConfigDefaults → loadPlugin → onActivate → syncDynamicServices → registerServices → registerComponents → mountRoutes；
- `syncDynamicServices()` (`L529-L639`) 对齐 manifest 静态服务、运行时动态服务和数据库；
- `deactivate()` (`L278-L304`) 清理 service registry / component registry / route registry；
- `ServiceRegistry.combine()` (`@/workspaces/cat/packages/plugin-core/src/registry/service-registry.ts:L49-L97`) 与 `ComponentRegistry.combine()` (`@/workspaces/cat/packages/plugin-core/src/registry/component-registry.ts:L30-L60`) 把插件产物装配进运行时。
