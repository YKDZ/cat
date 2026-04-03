import type { PluginServiceType } from "@cat/shared/schema/enum";

import type { IPluginService } from "@/services/service";

/**
 * Authentication Assurance Level:
 * - 1: single factor (e.g. password)
 * - 2: multi-factor (e.g. password + TOTP)
 */
export type AuthFactorAAL = 1 | 2;

/**
 * Input provided by the user for this factor's challenge.
 */
export type AuthFactorInput = Record<string, unknown>;

/**
 * Result of executing an auth factor.
 */
export type AuthFactorResult =
  | {
      status: "success";
      /** Identifier on the external identity provider (for identity_resolver use). */
      providedAccountId?: string;
      /** Issuer string (for identity_resolver use). */
      providerIssuer?: string;
      /** AAL contributed by this factor. */
      aal: AuthFactorAAL;
      /** Additional data to store on the auth blackboard. */
      data?: Record<string, unknown>;
    }
  | {
      status: "failure";
      error: { code: string; message: string };
    };

/**
 * Context passed to an AUTH_FACTOR when it executes.
 */
export type AuthFactorExecutionContext = {
  /** The user identifier (email / username) from the blackboard. */
  identifier?: string;
  /** The resolved userId if identity is already known. */
  userId?: string;
  /** Input provided by the user in this step. */
  input: AuthFactorInput;
  /** Raw HTTP context for IP binding etc. */
  httpContext: {
    ip: string;
    userAgent: string;
  };
};

/**
 * AUTH_FACTOR service interface.
 * Replaces the old `AuthProvider` + `MFAProvider` abstractions.
 *
 */
export abstract class AuthFactor implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "AUTH_FACTOR";
  }

  abstract getName(): string;
  abstract getIcon(): string;

  /**
   * The component type hint for the frontend renderer.
   * Must match one of the ClientComponentType values in @cat/auth.
   */
  abstract getClientComponentType(): string;

  /**
   * The AAL (Authentication Assurance Level) this factor provides.
   * - 1: first factor (e.g. password, passkey)
   * - 2: second factor / MFA (e.g. TOTP, hardware key)
   */
  abstract getAal(): AuthFactorAAL;

  /**
   * Execute the factor: verify credentials / challenge response.
   */
  abstract execute(ctx: AuthFactorExecutionContext): Promise<AuthFactorResult>;

  /** Whether this factor is available for use (e.g. dependencies configured). */
  abstract isAvailable(): Promise<boolean>;
}
