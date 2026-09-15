import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllocationKpiStrip, AllocationReadiness } from "./allocation-workbench";

describe("allocation workbench feedback", () => {
  it("shows blockers and KPI values without relying on color", () => {
    render(
      <>
        <AllocationKpiStrip items={[{ label: "Chưa phân", value: 12, tone: "danger" }]} />
        <AllocationReadiness
          data={{
            ready: false,
            eligible: 100,
            capacity: 90,
            resources: 3,
            blockers: [{ code: "capacity", message: "Thiếu 10 chỗ" }],
            warnings: [],
          }}
        />
      </>,
    );
    expect(screen.getByText("Chưa phân")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Thiếu 10 chỗ")).toBeInTheDocument();
  });
});
