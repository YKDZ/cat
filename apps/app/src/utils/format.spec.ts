import { afterEach, describe, expect, it } from "vitest";

import {
  formatCalendarDate,
  formatDate,
  formatShortDateTime,
  formatTime,
  formatTimestamp,
} from "./format.ts";

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("UTC date formatting", () => {
  it("keeps calendar dates and times stable across the UTC day boundary", () => {
    const date = "2026-08-08T16:00:00.000Z";

    process.env.TZ = "UTC";
    const serverDate = formatCalendarDate(date);
    const serverTime = formatTime(date);

    process.env.TZ = "Asia/Shanghai";
    expect(formatCalendarDate(date)).toBe(serverDate);
    expect(formatTime(date)).toBe(serverTime);
    expect(serverDate).toBe("2026/8/8");
  });

  it("is independent of the runtime time zone and canonicalizes app locales", () => {
    const date = "2026-08-03T00:18:03.000Z";
    process.env.TZ = "America/Los_Angeles";
    const serverValue = formatTimestamp(date, "zh_cn");

    process.env.TZ = "Asia/Shanghai";
    const clientValue = formatTimestamp(date, "zh-CN");

    expect(clientValue).toBe(serverValue);
    expect(clientValue).toContain("UTC");
  });

  it("preserves seconds and the requested locale for date-time displays", () => {
    const date = "2026-08-08T16:00:07.000Z";

    expect(formatTimestamp(date, "en-US")).toContain("07");
    expect(formatTimestamp(date, "en-US")).not.toBe(
      formatTimestamp(date, "zh-CN"),
    );
    expect(formatShortDateTime(date, "en-US")).not.toBe(
      formatShortDateTime(date, "zh-CN"),
    );
  });

  it("falls back safely for invalid dates and locales", () => {
    expect(formatDate("not-a-date", "en_us")).toBe("—");
    expect(formatDate("2026-08-03T00:18:03.000Z", "not_a_locale")).toContain(
      "UTC",
    );
  });
});
