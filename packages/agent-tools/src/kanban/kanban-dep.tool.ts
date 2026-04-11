import type { AgentToolDefinition } from "@cat/agent";

import {
  addCardDep,
  CyclicDependencyError,
  executeCommand,
  executeQuery,
  getDbHandle,
  listCardDeps,
  removeCardDep,
} from "@cat/domain";
import * as z from "zod/v4";

// ─── Tool: add_card_dependency ────────────────────────────────────────────────

const AddCardDependencySchema = z.object({
  cardId: z
    .int()
    .positive()
    .describe("The ID of the card that has the dependency"),
  dependsOnCardId: z
    .int()
    .positive()
    .describe("The ID of the card that must be completed first (prerequisite)"),
  depType: z
    .enum(["FINISH_TO_START", "DATA"])
    .default("FINISH_TO_START")
    .describe(
      "Dependency type: FINISH_TO_START (blocker) or DATA (data dependency)",
    ),
});

/**
 * @zh 创建添加看板卡片依赖的工具（含环路检测）。
 * @en Create the tool for adding a kanban card dependency (with cycle detection).
 */
export const createAddCardDependencyTool = (): AgentToolDefinition => ({
  name: "add_card_dependency",
  description:
    "Add a dependency between two kanban cards. The dependent card (cardId) will be blocked until the prerequisite card (dependsOnCardId) reaches DONE status. Cycle detection is automatic — circular dependencies are rejected.",
  parameters: AddCardDependencySchema as z.ZodObject<z.ZodRawShape>,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  execute: async (args) => {
    const input = AddCardDependencySchema.parse(args);
    const { client: db } = await getDbHandle();
    try {
      await executeCommand({ db }, addCardDep, input);
      return {
        success: true,
        message: `Dependency added: card ${input.cardId} now depends on card ${input.dependsOnCardId}`,
      };
    } catch (err) {
      if (err instanceof CyclicDependencyError) {
        return {
          success: false,
          error: "cycle_detected",
          message: err.message,
        };
      }
      throw err;
    }
  },
});

// ─── Tool: remove_card_dependency ─────────────────────────────────────────────

const RemoveCardDependencySchema = z.object({
  cardId: z.int().positive().describe("The ID of the dependent card"),
  dependsOnCardId: z
    .int()
    .positive()
    .describe("The ID of the prerequisite card"),
});

/**
 * @zh 创建移除看板卡片依赖的工具。
 * @en Create the tool for removing a kanban card dependency.
 */
export const createRemoveCardDependencyTool = (): AgentToolDefinition => ({
  name: "remove_card_dependency",
  description: "Remove an existing dependency between two kanban cards.",
  parameters: RemoveCardDependencySchema as z.ZodObject<z.ZodRawShape>,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  execute: async (args) => {
    const input = RemoveCardDependencySchema.parse(args);
    const { client: db } = await getDbHandle();
    await executeCommand({ db }, removeCardDep, input);
    return {
      success: true,
      message: `Dependency removed: card ${input.cardId} no longer depends on card ${input.dependsOnCardId}`,
    };
  },
});

// ─── Tool: list_card_dependencies ─────────────────────────────────────────────

const ListCardDependenciesSchema = z.object({
  cardId: z.int().positive().describe("The kanban card to query"),
  direction: z
    .enum(["blocking", "blocked_by"])
    .default("blocking")
    .describe(
      "blocking: cards this card depends on (prerequisites); blocked_by: cards that depend on this card",
    ),
});

/**
 * @zh 创建查询看板卡片依赖列表的工具。
 * @en Create the tool for listing kanban card dependencies.
 */
export const createListCardDependenciesTool = (): AgentToolDefinition => ({
  name: "list_card_dependencies",
  description:
    "List dependency relationships for a kanban card. Use direction=blocking to see what this card depends on, or direction=blocked_by to see which cards are waiting for this card.",
  parameters: ListCardDependenciesSchema as z.ZodObject<z.ZodRawShape>,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  execute: async (args) => {
    const input = ListCardDependenciesSchema.parse(args);
    const { client: db } = await getDbHandle();
    const deps = await executeQuery({ db }, listCardDeps, input);
    return deps.map((d) => ({
      cardId: d.cardId,
      dependsOnCardId: d.dependsOnCardId,
      depType: d.depType,
      relatedCardTitle: d.relatedCardTitle,
      relatedCardStatus: d.relatedCardStatus,
    }));
  },
});
