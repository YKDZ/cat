import type { PluginCapabilities } from "@cat/domain";

import {
  AuthFactor,
  type AuthFactorExecutionContext,
  type AuthFactorResult,
} from "@cat/plugin-core";
import { verifyPassword } from "@cat/server-shared";
import * as z from "zod/v4";

const InputSchema = z.object({
  password: z.string().min(1),
});

export class PasswordFactor extends AuthFactor {
  constructor(private readonly capabilities: PluginCapabilities) {
    super();
  }

  getId(): string {
    return "PASSWORD";
  }

  getName(): string {
    return "密码";
  }

  getIcon(): string {
    return "icon-[mdi--ssh]";
  }

  getClientComponentType(): string {
    return "password_input";
  }

  getAal(): 1 {
    return 1;
  }

  async execute(ctx: AuthFactorExecutionContext): Promise<AuthFactorResult> {
    const parsed = InputSchema.safeParse(ctx.input);
    if (!parsed.success) {
      return {
        status: "failure",
        error: { code: "INVALID_INPUT", message: "Password is required" },
      };
    }

    const { password } = parsed.data;

    if (!ctx.identifier) {
      return {
        status: "failure",
        error: {
          code: "IDENTIFIER_MISSING",
          message: "No identifier provided",
        },
      };
    }

    const meta =
      await this.capabilities.auth.getAccountMetaByProviderAndIdentifier({
        providedAccountId: ctx.identifier,
        providerIssuer: "PASSWORD",
      });

    const passwordHash = z.object({ password: z.string() }).safeParse(meta);

    if (!passwordHash.success) {
      return {
        status: "failure",
        error: { code: "USER_NOT_FOUND", message: "Credentials invalid" },
      };
    }

    const valid = await verifyPassword(password, passwordHash.data.password);
    if (!valid) {
      return {
        status: "failure",
        error: { code: "INVALID_PASSWORD", message: "Credentials invalid" },
      };
    }

    return {
      status: "success",
      aal: 1,
      providedAccountId: ctx.identifier,
      providerIssuer: "PASSWORD",
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
