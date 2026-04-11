import type { PreCheckServices } from "@cat/agent";
import type { DbHandle } from "@cat/domain";

import { executeQuery, getCard, listCardDeps } from "@cat/domain";

/**
 * @zh 创建 AgentRuntime 需要的 PreCheck 服务集合。
 * @en Create the PreCheck service set required by AgentRuntime.
 *
 * @param db - {@zh 当前请求使用的数据库句柄} {@en Database handle for the current request}
 * @returns - {@zh 可注入到 AgentRuntime 的 PreCheck 服务} {@en PreCheck services injectable into AgentRuntime}
 */
export const createPreCheckServices = (db: DbHandle): PreCheckServices => ({
  checkKanbanDeps: async (cardId) => {
    const card = await executeQuery({ db }, getCard, { id: cardId });
    if (!card) {
      return { allMet: true, blocking: [] };
    }

    const deps = await executeQuery({ db }, listCardDeps, {
      cardId: card.id,
      direction: "blocking",
    });

    const blocking = deps
      .filter((dep) => dep.relatedCardStatus !== "DONE")
      .map((dep) => `${dep.relatedCardTitle}#${dep.relatedCardId}`);

    return {
      allMet: blocking.length === 0,
      blocking,
    };
  },
});
