import { describe, expect, it } from "vitest";
import { buildJourneyStages, galaTableLabel } from "./journey-view";
import type { Journey } from "@/types/api";

function journeyFixture(): Journey {
  return {
    event_id: 1,
    event_name: "Team Building",
    event_status: "information_published",
    destination: "Đà Nẵng",
    start_date: "2026-12-20",
    end_date: "2026-12-22",
    full_name: "Nguyễn Văn A",
    employee_code: "NV001",
    team_name: "Marketing",
    site_name: "HCM",
    phone: null,
    is_participating: true,
    flights: [{
      direction: "outbound",
      flight_code: "VN101",
      airline: "Vietnam Airlines",
      depart_at: "2026-12-20T08:00:00Z",
      arrive_at: "2026-12-20T09:20:00Z",
      origin: "Tân Sơn Nhất",
      destination: "Đà Nẵng",
    }],
    buses: [],
    room: null,
    gala: null,
    schedule: [
      { day_date: "2026-12-20", start_at: "2026-12-20T07:00:00Z", end_at: null, title: "Bay tới Đà Nẵng", location: "Nội Bài" },
      { day_date: "2026-12-20", start_at: "2026-12-20T14:00:00Z", end_at: null, title: "Nhận phòng", location: "Resort" },
    ],
    announcements: [],
  };
}

describe("journey presentation", () => {
  it("does not duplicate the Bàn prefix", () => {
    expect(galaTableLabel("Bàn 4", "T04")).toBe("Bàn 4");
    expect(galaTableLabel(null, "T04")).toBe("Bàn T04");
  });

  it("hides a generic flight schedule when a personal flight exists", () => {
    const stages = buildJourneyStages(journeyFixture());
    expect(stages.some((stage) => stage.title === "Bay tới Đà Nẵng")).toBe(false);
    expect(stages.some((stage) => stage.title.includes("VN101"))).toBe(true);
    expect(stages.some((stage) => stage.title === "Nhận phòng")).toBe(true);
  });

  it("keeps a naive flight time on the Vietnam event day", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const journey = journeyFixture();
      journey.flights[0].depart_at = "2026-12-20T08:00:00";
      const flight = buildJourneyStages(journey).find((stage) => stage.kind === "flight");
      expect(flight?.dayKey).toBe("2026-12-20");
      expect(flight?.title).toContain("08:00");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("shows the employee's own Gala seat in the journey", () => {
    const journey = journeyFixture();
    journey.gala = {
      status: "finished", name: "Gala Dinner",
      tables: [{ table_code: "B1", table_name: "Bàn 1", seats: [
        { seat_number: 1, label: "B1-1" }, { seat_number: 2, label: "B1-2" },
      ] }],
      my_seat: { table_code: "B1", table_name: "Bàn 1", seat_number: 2, label: "B1-2" },
    };
    const gala = buildJourneyStages(journey).find((stage) => stage.kind === "gala");
    expect(gala?.rows).toEqual(["Ghế của bạn: Bàn 1 · ghế 2"]);
  });
});
