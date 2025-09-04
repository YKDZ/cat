import type { HTTPHelpers, JSONSchema, JSONType } from "@cat/shared";

export type PreAuthResult = {
  sessionId: string;
  sessionMeta: Record<string, number | string>;
  passToClient: Record<string, unknown>;
};

export type AuthResult = {
  email: string;
  emailVerified?: boolean;
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
  getIcon: () => string;
  getPreAuthFormSchema?: () => JSONSchema;
  handlePreAuth?: (
    sessionId: string,
    gotFromClient: {
      formData?: unknown;
    },
    helpers: HTTPHelpers,
  ) => Promise<PreAuthResult>;
  getAuthFormSchema?: () => JSONSchema;
  handleAuth: (
    gotFromClient: {
      urlSearchParams: unknown;
      formData?: unknown;
    },
    helpers: HTTPHelpers,
  ) => Promise<AuthResult>;
  handleLogout?: (sessionId: string) => Promise<void>;
  isAvaliable: () => Promise<boolean>;
}
