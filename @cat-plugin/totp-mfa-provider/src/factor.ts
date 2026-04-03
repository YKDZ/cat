import type { PluginCapabilities } from "@cat/plugin-core";

import {
  AuthFactor,
  type AuthFactorExecutionContext,
  type AuthFactorResult,
} from "@cat/plugin-core";
import speakeasy from "speakeasy";
import * as z from "zod/v4";

const TotpTokenSchema = z.string().regex(/^\d{6}$/);

const InputSchema = z.object({
  token: TotpTokenSchema,
});

const PayloadSchema = z.object({
  secret: z.string(),
});

const verify = (secret: string, token: string, window = 2) =>
  speakeasy.totp.verify({ secret, encoding: "base32", token, window });

export class TotpFactor extends AuthFactor {
  constructor(private readonly capabilities: PluginCapabilities) {
    super();
  }

  getId(): string {
    return "TOTP";
  }

  getName(): string {
    return "TOTP 验证器";
  }

  getIcon(): string {
    return "icon-[mdi--two-factor-authentication]";
  }

  getClientComponentType(): string {
    return "totp_input";
  }

  getAal(): 2 {
    return 2;
  }

  async execute(ctx: AuthFactorExecutionContext): Promise<AuthFactorResult> {
    const parsed = InputSchema.safeParse(ctx.input);
    if (!parsed.success) {
      return {
        status: "failure",
        error: {
          code: "INVALID_INPUT",
          message: "A 6-digit TOTP token is required",
        },
      };
    }

    const { token } = parsed.data;

    if (!ctx.userId) {
      return {
        status: "failure",
        error: { code: "USER_NOT_RESOLVED", message: "User ID not available" },
      };
    }

    const payload = await this.capabilities.auth.getMfaPayloadForUser({
      userId: ctx.userId,
      factorId: this.getId(),
    });

    const secretResult = PayloadSchema.safeParse(payload);
    if (!secretResult.success) {
      return {
        status: "failure",
        error: {
          code: "TOTP_NOT_CONFIGURED",
          message: "TOTP not configured for this user",
        },
      };
    }

    const valid = verify(secretResult.data.secret, token);
    if (!valid) {
      return {
        status: "failure",
        error: { code: "INVALID_TOKEN", message: "Invalid TOTP token" },
      };
    }

    return {
      status: "success",
      aal: 2,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
