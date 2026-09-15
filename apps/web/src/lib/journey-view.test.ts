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
});
