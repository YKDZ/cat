import {
  MFAProvider,
  type MFAInitForUserContext,
  type MFAInitForUserResult,
  type MFAPreInitForUserContext,
  type MFAPreInitForUserResult,
  type MFAVerifyResult,
  type VerifyChallengeContext,
} from "@cat/plugin-core";
import type { JSONSchema } from "@cat/shared/schema/json";
import * as z from "zod";
import speakeasy from "speakeasy";

const TotpTokenSchema = z.string().regex(/^\d{6}$/);

const VerifyChallengeSchema = z.object({
  token: TotpTokenSchema,
});

const ProviderPayloadSchema = z.object({
  secret: z.string(),
});
type ProviderPayload = z.infer<typeof ProviderPayloadSchema>;

const PreInitPayloadSchema = z.object({
  secret: z.string(),
});
type PreInitPayload = z.infer<typeof PreInitPayloadSchema>;

const InitGotFromClientSchema = z.object({
  token: z.string(),
});

const verify = (secret: string, token: string, window: number = 2) => {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window,
  });
};

export class Provider extends MFAProvider {
  getId(): string {
    return "totp";
  }

  override async preInitForUser(
    ctx: MFAPreInitForUserContext,
  ): Promise<MFAPreInitForUserResult> {
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `CAT (${ctx.userId})`,
      issuer: "CAT",
    });

    return {
      payload: {
        secret: secret.base32,
      } satisfies PreInitPayload,
    };
  }

  override async initForUser(
    ctx: MFAInitForUserContext,
  ): Promise<MFAInitForUserResult> {
    const { secret } = PreInitPayloadSchema.parse(ctx.preInitPayload);
    const { token } = InitGotFromClientSchema.parse(ctx.gotFromClient);

    const isSuccess = verify(secret, token);

    return {
      isSuccess,
      payload: {
        secret,
      } satisfies ProviderPayload,
    };
  }

  override getVerifyChallengeFormSchema(): JSONSchema {
    return VerifyChallengeSchema.toJSONSchema();
  }

  async verifyChallenge(ctx: VerifyChallengeContext): Promise<MFAVerifyResult> {
    const { secret } = ProviderPayloadSchema.parse(ctx.mfaProvider.payload);
    const { token } = VerifyChallengeSchema.parse(ctx.gotFromClient.formData);

    return { isSuccess: verify(secret, token) };
  }
}
