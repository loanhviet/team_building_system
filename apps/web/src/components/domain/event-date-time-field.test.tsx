import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventDateTimeField } from "./event-date-time-field";

describe("EventDateTimeField", () => {
  it("combines a suggested event date with a quick time", () => {
    const onChange = vi.fn();
    render(
      <EventDateTimeField
        ariaLabel="Khởi hành"
        value=""
        onChange={onChange}
        defaultDate="2026-12-20"
        dateOptions={[{ value: "2026-12-20", label: "CN, 20/12" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "CN, 20/12" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-12-20T08:00");

    fireEvent.change(screen.getByLabelText("Khởi hành - giờ"), {
      target: { value: "08:05" },
    });
    expect(onChange).toHaveBeenLastCalledWith("2026-12-20T08:05");
  });
});
