import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";

import { createPluginCapabilities } from "#/capabilities/capability-factory.ts";
import {
  GlossaryListByCreatorCapabilityInputSchema,
  MemoryListByCreatorCapabilityInputSchema,
  ProjectListByCreatorCapabilityInputSchema,
} from "#/capabilities/resource-list-contracts.ts";
import type { PluginCapabilities } from "#/capabilities/types.ts";

const creatorId = "11111111-1111-4111-8111-111111111111";
const unpaged = { creatorId, pagination: "unpaged" } as const;

describe("plugin resource list capabilities", () => {
  it("requires bounded pagination at the public capability boundary", async () => {
    const capabilities = createPluginCapabilities(undefined as never);
    await expect(
      capabilities.project.listByCreator(unpaged as never),
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      capabilities.memory.listByCreator(unpaged as never),
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      capabilities.glossary.listByCreator(unpaged as never),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("exposes exact paged schemas and types without an unpaged fallback", () => {
    const paged = { creatorId, pageIndex: 0, pageSize: 100 };
    expect(ProjectListByCreatorCapabilityInputSchema.parse(paged)).toEqual(
      paged,
    );
    expect(MemoryListByCreatorCapabilityInputSchema.parse(paged)).toEqual(
      paged,
    );
    expect(GlossaryListByCreatorCapabilityInputSchema.parse(paged)).toEqual(
      paged,
    );

    expectTypeOf<
      Parameters<PluginCapabilities["project"]["listByCreator"]>[0]
    >().toEqualTypeOf<
      z.infer<typeof ProjectListByCreatorCapabilityInputSchema>
    >();
    // @ts-expect-error Plugin list capabilities require bounded pagination.
    const rejectedUnpagedInput: Parameters<
      PluginCapabilities["memory"]["listByCreator"]
    >[0] = unpaged;
    expect(rejectedUnpagedInput).toBe(unpaged);
  });
});
