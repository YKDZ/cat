import { expect, test, vi } from "vitest";
import { setting, settings } from "./setting";
import { prisma } from "../__mocks__/prisma";
import type { Setting } from "@cat/shared";

vi.mock("../prisma");

test("should return exists value", async () => {
  const existSetting = {
    id: 1,
    key: "server.name",
    value: "My CAT",
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies Setting;

  prisma.setting.findUnique.mockResolvedValue(existSetting);

  const name = await setting("server.name", "CAT");

  expect(name).toStrictEqual(existSetting.value);
});

test("should return default value if setting not exists", async () => {
  prisma.setting.findUnique.mockResolvedValue(null);

  const defaultValue = "CAT";

  const name = await setting("server.name", defaultValue);

  expect(name).toStrictEqual(defaultValue);
});

test("should return key: value record", async () => {
  prisma.setting.findMany.mockResolvedValue([
    {
      id: 1,
      key: "server.name",
      value: "CAT",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      key: "server.description",
      value: "Translation Platform",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const result = await settings("server.");

  expect(result).toStrictEqual({
    "server.name": "CAT",
    "server.description": "Translation Platform",
  });
});
