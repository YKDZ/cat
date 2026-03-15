import { verifyPassword } from "@cat/db";
import {
  AuthProvider,
  type AuthResult,
  type PluginCapabilities,
} from "@cat/plugin-core";
import { JSONSchema } from "@cat/shared/schema/json";
import * as z from "zod/v4";

const FormSchema = z.object({
  password: z
    .string()
    .min(6)
    .meta({ "x-secret": true, "x-autocomplete": "current-password" }),
});

export class Provider extends AuthProvider {
  public constructor(private readonly capabilities: PluginCapabilities) {
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

  override getAuthFormSchema(): JSONSchema {
    return z.toJSONSchema(FormSchema);
  }

  async handleAuth(
    userId: string,
    identifier: string,
    gotFromClient: { formData?: unknown },
  ): Promise<AuthResult> {
    const { password } = FormSchema.parse(gotFromClient.formData);

    const meta = await this.capabilities.auth.getAccountMetaByIdentity({
      userId,
      providedAccountId: identifier,
      providerIssuer: this.getId(),
    });

    if (!meta) throw new Error("Account not found");

    if (
      !(await verifyPassword(
        password,
        z
          .object({
            password: z.string(),
          })
          .parse(meta).password,
      ))
    )
      throw Error("Wrong password");

    return {
      providerIssuer: this.getId(),
      providedAccountId: identifier,
    } satisfies AuthResult;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
