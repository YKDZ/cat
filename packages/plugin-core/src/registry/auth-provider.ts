import type { HTTPHelpers } from "@cat/shared";

export type PreAuthResult = {
  sessionId: string;
  sessionMeta: Record<string, number | string>;
  passToClient: Record<string, unknown>;
};

export type AuthResult = {
  userName: string;
  providerIssuer: string;
  providedAccountId: string;
  sessionMeta: Record<string, number | string>;
};

export interface AuthProvider {
  getId: () => string;
  getType: () => string;
  getName: () => string;
  needPreAuth: () => boolean;
  getPreAuthFormSchema?: () => string | null;
  handlePreAuth?: (
    gotFromClient: unknown,
    helpers: HTTPHelpers,
  ) => Promise<PreAuthResult>;
  getAuthFormSchema?: () => string | null;
  handleAuth: (
    gotFromClient: unknown,
    helpers: HTTPHelpers,
  ) => Promise<AuthResult>;
  handleLogout: (sessionId: string) => Promise<void>;
}
