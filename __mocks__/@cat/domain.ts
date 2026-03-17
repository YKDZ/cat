import { vi } from "vitest";

/**
 * 手动 mock：`vi.mock('@cat/domain')` 时 Vitest 自动使用本文件。
 *
 * 仅 mock `executeCommand` / `executeQuery` 这两个核心执行函数。
 * 其余需要 mock 的具体 command/query 函数通常以引用形式传入这两个函数，
 * 因此只需让这两个函数返回受控值即可。
 *
 * 测试中使用方式：
 * ```ts
 * import { vi } from 'vitest'
 * vi.mock('@cat/domain')
 * import { executeCommand } from '@cat/domain'
 *
 * vi.mocked(executeCommand).mockResolvedValueOnce({ id: 'test-id' })
 * ```
 */
export const executeCommand = vi.fn();
export const executeQuery = vi.fn();

// Runtime helpers called directly by plugin-core internals
export const createPluginCapabilities = vi.fn(() => ({}));
export const getCacheStore = vi.fn(() => ({}));
export const getSessionStore = vi.fn(() => ({}));
