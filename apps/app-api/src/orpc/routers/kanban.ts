import {
  claimCard,
  createBoard,
  createCard,
  executeCommand,
  executeQuery,
  getBoard,
  getCard,
  listBoards,
  listCards,
  updateCardStatus,
  CreateBoardCommandSchema,
  CreateCardCommandSchema,
  ClaimCardCommandSchema,
  UpdateCardStatusCommandSchema,
} from "@cat/domain";
import {
  KanbanBoardSchema,
  KanbanCardSchema,
} from "@cat/shared/schema/drizzle/kanban";
import { KanbanCardStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import { authed, checkPermission } from "@/orpc/server";

/** Create a new Kanban board */
export const createKanbanBoard = authed
  .input(CreateBoardCommandSchema)
  .use(checkPermission("kanban_board", "editor"), () => "*")
  .output(KanbanBoardSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, createBoard, input);
  });

/** List Kanban boards, optionally filtered by orgId or linked resource */
export const listKanbanBoards = authed
  .input(
    z.object({
      orgId: z.uuid().optional(),
      linkedResourceType: z.string().optional(),
      linkedResourceId: z.string().optional(),
    }),
  )
  .output(z.array(KanbanBoardSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, listBoards, input);
  });

/** Get a single Kanban board by its external UUID */
export const getKanbanBoard = authed
  .input(z.object({ id: z.uuid() }))
  .output(KanbanBoardSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, getBoard, input);
  });

/** Create a new card on a Kanban board */
export const createKanbanCard = authed
  .input(CreateCardCommandSchema)
  .use(checkPermission("kanban_board", "editor"), () => "*")
  .output(KanbanCardSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, createCard, input);
  });

/** List cards on a board, optionally filtered by status or column */
export const listKanbanCards = authed
  .input(
    z.object({
      boardId: z.int().positive(),
      status: KanbanCardStatusSchema.optional(),
      columnId: z.string().optional(),
    }),
  )
  .output(z.array(KanbanCardSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, listCards, input);
  });

/** Get a single Kanban card by its external UUID */
export const getKanbanCard = authed
  .input(z.object({ id: z.uuid() }))
  .output(KanbanCardSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, getCard, input);
  });

/** Update the status of a Kanban card */
export const updateKanbanCardStatus = authed
  .input(UpdateCardStatusCommandSchema)
  .use(checkPermission("kanban_board", "editor"), () => "*")
  .output(KanbanCardSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, updateCardStatus, input);
  });

/** Atomically claim a Kanban card using FOR UPDATE SKIP LOCKED */
export const claimKanbanCard = authed
  .input(ClaimCardCommandSchema)
  .use(checkPermission("kanban_board", "member"), () => "*")
  .output(
    z
      .object({
        id: z.int(),
        externalId: z.uuidv4(),
        title: z.string(),
        linkedResourceType: z.string().nullable(),
        linkedResourceId: z.string().nullable(),
      })
      .nullable(),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, claimCard, input);
  });
