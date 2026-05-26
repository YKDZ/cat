import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeMemorySeed } from "@/pipeline";
import { MemorySeedSchema } from "@/schemas";

describe("normalizeMemorySeed", () => {
  it("normalizes legacy memory into one PROJECT container", () => {
    const seed = MemorySeedSchema.parse({
      memory: {
        name: "Legacy",
        items: [
          {
            ref: "mem:legacy:1",
            source: "Create New World",
            translation: "创建新的世界",
            sourceLanguage: "en",
            translationLanguage: "zh-Hans",
          },
        ],
      },
    });

    const containers = normalizeMemorySeed(seed);

    expect(containers).toHaveLength(1);
    expect(containers[0]?.scope).toBe("PROJECT");
  });

  it("preserves multi-container order and scopes", () => {
    const seed = MemorySeedSchema.parse({
      memories: [
        {
          ref: "memory:project:test",
          name: "Project",
          scope: "PROJECT",
          items: [
            {
              ref: "mem:project:1",
              source: "Hardcore Mode!",
              translation: "极限模式！",
              sourceLanguage: "en",
              translationLanguage: "zh-Hans",
            },
          ],
        },
        {
          ref: "memory:personal:test",
          name: "Personal",
          scope: "PERSONAL",
          ownerRef: "user:translator",
          items: [
            {
              ref: "mem:personal:1",
              source: "Hardcore Mode!",
              translation: "硬核模式！",
              sourceLanguage: "en",
              translationLanguage: "zh-Hans",
            },
          ],
        },
      ],
    });

    const containers = normalizeMemorySeed(seed);

    expect(containers.map((item) => item.scope)).toEqual([
      "PROJECT",
      "PERSONAL",
    ]);
  });
});

describe("minecraft memory fixture", () => {
  it("contains project/personal memory containers and expected contrast pairs", () => {
    const filePath = resolve(
      import.meta.dirname,
      "../../../tools/seeder/datasets/minecraft/seed/memory.json",
    );

    const parsed = MemorySeedSchema.parse(
      JSON.parse(readFileSync(filePath, "utf-8")),
    );
    const containers = normalizeMemorySeed(parsed);

    const projectContainer = containers.find(
      (container) => container.ref === "memory:project:minecraft",
    );
    const personalContainer = containers.find(
      (container) => container.ref === "memory:personal:translator",
    );

    expect(projectContainer).toBeDefined();
    expect(personalContainer).toBeDefined();
    expect(personalContainer?.scope).toBe("PERSONAL");
    expect(personalContainer?.ownerRef).toBe("user:translator");

    const movedRefs = [
      "mem:debug:advanced_tooltips_help",
      "mem:inventory:inventory_binSlot",
      "mem:sign:sign_edit",
    ];

    for (const movedRef of movedRefs) {
      expect(
        projectContainer?.items.some((item) => item.ref === movedRef),
      ).toBe(false);
      expect(
        personalContainer?.items.some((item) => item.ref === movedRef),
      ).toBe(true);
    }

    expect(
      projectContainer?.items.find(
        (item) => item.ref === "mem:addServer:addServer_enterIp",
      )?.translation,
    ).toBe("服务器地址");
    expect(
      personalContainer?.items.find(
        (item) => item.ref === "mem:personal:addServer_enterIp",
      )?.translation,
    ).toBe("服务器 IP 地址");

    expect(
      projectContainer?.items.find((item) => item.ref === "mem:ui:create_world")
        ?.translation,
    ).toBe("创建新的世界");
    expect(
      personalContainer?.items.find(
        (item) => item.ref === "mem:personal:create_world",
      )?.translation,
    ).toBe("新建世界");

    expect(
      projectContainer?.items.find((item) => item.ref === "mem:game:hardcore")
        ?.translation,
    ).toBe("极限模式！");
    expect(
      personalContainer?.items.find(
        (item) => item.ref === "mem:personal:hardcore",
      )?.translation,
    ).toBe("硬核模式！");

    expect(
      projectContainer?.items.find(
        (item) => item.ref === "mem:itemGroup:itemGroup_buildingBlocks",
      )?.translation,
    ).toBe("建筑方块");
    expect(
      personalContainer?.items.find(
        (item) => item.ref === "mem:personal:building_blocks",
      )?.translation,
    ).toBe("建材方块");
  });
});
