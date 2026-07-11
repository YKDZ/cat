import { pbkdf2, timingSafeEqual } from "node:crypto";

import {
  AuthFactor,
  type AuthFactorExecutionContext,
  type AuthFactorResult,
  type PluginCapabilities,
} from "@cat/plugin-core";
import * as z from "zod";

const expectedKeyLength = 64;

const verifyPassword = async (
  password: string,
  storedSaltHash: string,
): Promise<boolean> => {
  const [salt, keyHex] = storedSaltHash.split(":");
  if (!salt || !keyHex) return false;

  const storedKey = Buffer.from(keyHex, "hex");
  if (storedKey.length !== expectedKeyLength) return false;

  return new Promise<boolean>((resolve, reject) => {
    pbkdf2(
      password,
      salt,
      1024,
      expectedKeyLength,
      "sha512",
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(timingSafeEqual(storedKey, derivedKey));
      },
    );
  });
};

const InputSchema = z.object({
  password: z.string().min(1),
});

export class PasswordFactor extends AuthFactor {
  private readonly capabilities: PluginCapabilities;

  constructor(capabilities: PluginCapabilities) {
    super();
    this.capabilities = capabilities;
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
