import { expect, test } from "vitest";
import { useStringTemplate } from "./string-template";

test("should return correct string", () => {
  const date = new Date();
  const template = "/test/path/{year}/{month}/{date}";

  const result = useStringTemplate(template, { date });

  expect(result).toStrictEqual(
    `/test/path/${date.getFullYear()}/${date.getMonth()}/${date.getDate()}`,
  );
});
