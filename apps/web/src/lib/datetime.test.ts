import { describe, expect, it } from "vitest";
import {
  addMinutesToDatetimeLocal,
  durationLabel,
  eventDateOptions,
  joinDatetimeLocal,
  splitDatetimeLocal,
} from "./datetime";

describe("event date and time helpers", () => {
  it("builds selectable dates for an event range", () => {
    expect(eventDateOptions("2026-12-20", "2026-12-22").map((item) => item.value)).toEqual([
      "2026-12-20",
      "2026-12-21",
      "2026-12-22",
    ]);
  });

  it("keeps local date-time values and calculates cross-day durations", () => {
    expect(splitDatetimeLocal("2026-12-20T08:05")).toEqual({ date: "2026-12-20", time: "08:05" });
    expect(joinDatetimeLocal("2026-12-20", "08:05")).toBe("2026-12-20T08:05");
    expect(addMinutesToDatetimeLocal("2026-12-20T23:30", 90)).toBe("2026-12-21T01:00");
    expect(durationLabel("2026-12-20T23:30", "2026-12-21T01:00")).toBe("1 giờ 30 phút");
  });
});
