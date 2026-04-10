import type {
  KanbanBoard,
  KanbanCard,
} from "@cat/shared/schema/drizzle/kanban";
import type { KanbanCardStatus } from "@cat/shared/schema/enum";

import { defineStore } from "pinia";
import { ref } from "vue";

import { orpc } from "@/app/rpc/orpc";
import { clientLogger as logger } from "@/app/utils/logger";

export const useKanbanStore = defineStore("kanban", () => {
  const boards = ref<KanbanBoard[]>([]);
  const currentBoard = ref<KanbanBoard | null>(null);
  const cards = ref<KanbanCard[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const fetchBoards = async (params?: {
    orgId?: string;
    linkedResourceType?: string;
    linkedResourceId?: string;
  }) => {
    isLoading.value = true;
    error.value = null;
    try {
      boards.value = await orpc.kanban.listKanbanBoards(params ?? {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error.value = msg;
      logger.withSituation("kanban").error(err, "Failed to fetch boards");
    } finally {
      isLoading.value = false;
    }
  };

  const fetchBoard = async (boardId: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      currentBoard.value = await orpc.kanban.getKanbanBoard({ id: boardId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error.value = msg;
      logger.withSituation("kanban").error(err, "Failed to fetch board");
    } finally {
      isLoading.value = false;
    }
  };

  const fetchCards = async (boardId: number) => {
    isLoading.value = true;
    error.value = null;
    try {
      cards.value = await orpc.kanban.listKanbanCards({ boardId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error.value = msg;
      logger.withSituation("kanban").error(err, "Failed to fetch cards");
    } finally {
      isLoading.value = false;
    }
  };

  const claimCard = async (boardId: number, agentId?: number) => {
    try {
      return await orpc.kanban.claimKanbanCard({ boardId, agentId });
    } catch (err) {
      logger.withSituation("kanban").error(err, "Failed to claim card");
      return null;
    }
  };

  const updateCardStatus = async (cardId: number, status: KanbanCardStatus) => {
    try {
      const result = await orpc.kanban.updateKanbanCardStatus({
        cardId,
        status,
      });
      // Update local state
      const idx = cards.value.findIndex((c) => c.id === cardId);
      if (idx !== -1 && result) {
        cards.value[idx] = result as KanbanCard;
      }
      return result;
    } catch (err) {
      logger.withSituation("kanban").error(err, "Failed to update card status");
      return null;
    }
  };

  const createBoard = async (params: {
    name: string;
    linkedResourceType?: string;
    linkedResourceId?: string;
  }) => {
    try {
      const board = await orpc.kanban.createKanbanBoard(params);
      boards.value.push(board);
      return board;
    } catch (err) {
      logger.withSituation("kanban").error(err, "Failed to create board");
      return null;
    }
  };

  return {
    boards,
    currentBoard,
    cards,
    isLoading,
    error,
    fetchBoards,
    fetchBoard,
    fetchCards,
    claimCard,
    updateCardStatus,
    createBoard,
  };
});
