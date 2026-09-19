import { afterEach, describe, expect, it } from "vitest";
import { formatDateTime, formatTime, formatUtcDateTime, parseApiDateTime } from "./format";

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("API and event timestamps", () => {
  it("shows naive system UTC time in Vietnam time", () => {
    process.env.TZ = "Asia/Bangkok";
    expect(formatUtcDateTime("2026-09-18T05:41:41")).toContain("12:41");
    expect(parseApiDateTime("2026-09-18T05:41:41").getTime()).toBe(Date.parse("2026-09-18T05:41:41Z"));
  });

  it("keeps event wall-clock time in Vietnam on any browser timezone", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(formatDateTime("2026-09-18T08:00:00")).toContain("08:00");
    expect(formatTime("2026-09-18T08:00:00")).toContain("08:00");
    expect(formatDateTime("2026-09-18T12:41:41+07:00")).toContain("12:41");
    expect(formatUtcDateTime("2026-09-18T05:41:41Z")).toContain("12:41");
  });
});
