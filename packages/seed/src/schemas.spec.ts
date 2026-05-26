import { describe, expect, it } from "vitest";

import { MemorySeedSchema } from "@/schemas";

describe("MemorySeedSchema", () => {
  it("accepts legacy single-memory format and defaults scope to PROJECT", () => {
    const parsed = MemorySeedSchema.parse({
      memory: {
        name: "Legacy Memory",
        items: [
          {
            ref: "mem:legacy:1",
            source: "Hello",
            translation: "你好",
            sourceLanguage: "en",
            translationLanguage: "zh-Hans",
          },
        ],
      },
    });

    expect(parsed.memory?.scope).toBe("PROJECT");
    expect(parsed.memory?.ownerRef).toBeUndefined();
  });

  it("accepts multi-container format with personal ownerRef", () => {
    const parsed = MemorySeedSchema.parse({
      memories: [
        {
          ref: "memory:project:test",
          name: "Project Memory",
          scope: "PROJECT",
          items: [
            {
              ref: "mem:project:1",
              source: "Server Address",
              translation: "服务器地址",
              sourceLanguage: "en",
              translationLanguage: "zh-Hans",
            },
          ],
        },
        {
          ref: "memory:personal:test",
          name: "Personal Memory",
          scope: "PERSONAL",
          ownerRef: "user:translator",
          items: [
            {
              ref: "mem:personal:1",
              source: "Server Address",
              translation: "服务器 IP 地址",
              sourceLanguage: "en",
              translationLanguage: "zh-Hans",
            },
          ],
        },
      ],
    });

    expect(parsed.memories).toHaveLength(2);
    expect(parsed.memories?.[1]?.ownerRef).toBe("user:translator");
  });

  it("rejects personal container without ownerRef", () => {
    expect(() =>
      MemorySeedSchema.parse({
        memories: [
          {
            name: "Broken Personal",
            scope: "PERSONAL",
            items: [
              {
                ref: "mem:broken:1",
                source: "Destroy Item",
                translation: "摧毁物品",
                sourceLanguage: "en",
                translationLanguage: "zh-Hans",
              },
            ],
          },
        ],
      }),
    ).toThrow(/ownerRef/);
  });
});
