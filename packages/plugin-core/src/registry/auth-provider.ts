import type { HTTPHelpers, JSONType } from "@cat/shared";
import type { JSONSchema } from "zod/v4/core";

export type PreAuthResult = {
  sessionId: string;
  sessionMeta: Record<string, number | string>;
  passToClient: Record<string, unknown>;
};

export type AuthResult = {
  userName: string;
  providerIssuer: string;
  providedAccountId: string;
  sessionMeta?: Record<string, number | string>;
  accountMeta?: JSONType;
};

export interface AuthProvider {
  getId: () => string;
  getType: () => string;
  getName: () => string;
  getPreAuthFormSchema?: () => JSONSchema.JSONSchema;
  handlePreAuth?: (
    sessionId: string,
    gotFromClient: unknown,
    helpers: HTTPHelpers,
  ) => Promise<PreAuthResult>;
  getAuthFormSchema?: () => JSONSchema.JSONSchema;
  handleAuth: (
    gotFromClient: unknown,
    helpers: HTTPHelpers,
  ) => Promise<AuthResult>;
  handleLogout?: (sessionId: string) => Promise<void>;
}
