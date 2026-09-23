"use client";

import { useQuery } from "@tanstack/react-query";
import { use, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { directionLabel } from "@/lib/labels";
import type { EmployeeList, Journey } from "@/types/api";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const query = search.trim();

  const people = useQuery({
    queryKey: ["employees", "journey-search", query],
    queryFn: () => apiFetch<EmployeeList>(`/api/employees?search=${encodeURIComponent(query)}&limit=8`),
    enabled: query.length >= 2,
  });

  const journey = useQuery({
    queryKey: ["journey", "admin", eventId, employeeId],
    queryFn: () =>
      apiFetch<Journey>(`/api/journey/me?event_id=${eventId}&employee_id=${employeeId}`),
    enabled: employeeId != null,
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tra hành trình một CBNV</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            value={search}
            placeholder="Tên hoặc mã nhân viên"
            aria-label="Tìm CBNV"
            onChange={(event) => setSearch(event.target.value)}
          />
          {query.length >= 2 && (
            <ul className="flex flex-col gap-1">
              {(people.data?.items ?? []).map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setEmployeeId(person.id)}
                  >
                    <span className="font-medium">{person.full_name}</span>
                    <span className="text-muted-foreground">
                      {person.employee_code ?? "—"}
                      {person.team_name ? ` · ${person.team_name}` : ""}
                    </span>
                  </button>
                </li>
              ))}
              {people.data && people.data.items.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">Không thấy người này.</li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {journey.data && <JourneySheet journey={journey.data} />}
    </div>
  );
}

function JourneySheet({ journey }: { journey: Journey }) {
  const participation =
    journey.is_participating == null
      ? "Chưa đăng ký"
      : journey.is_participating
        ? "Đã đăng ký tham gia"
        : "Không tham gia";
  const seat = journey.gala?.my_seat;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">
            {journey.full_name}
            {journey.employee_code ? ` · ${journey.employee_code}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {journey.team_name ?? "Chưa có team"}
          {journey.site_name ? ` · ${journey.site_name}` : ""} · {participation}
        </CardContent>
      </Card>

      <Section title="Chuyến bay" empty={journey.flights.length === 0} emptyText="Chưa được xếp chuyến.">
        {journey.flights.map((flight) => (
          <p key={`${flight.direction}-${flight.flight_code}`}>
            <span className="font-medium">{directionLabel(flight.direction)}</span>
            {` · ${flight.flight_code}`}
            {flight.airline ? ` · ${flight.airline}` : ""}
            <span className="block text-muted-foreground">
              {formatDateTime(flight.depart_at)} → {formatDateTime(flight.arrive_at)}
              {flight.origin || flight.destination
                ? ` · ${flight.origin ?? "—"} → ${flight.destination ?? "—"}`
                : ""}
            </span>
          </p>
        ))}
      </Section>

      <Section title="Xe" empty={journey.buses.length === 0} emptyText="Chưa được xếp xe.">
        {journey.buses.map((bus) => (
          <p key={`${bus.leg_name}-${bus.bus_code}`}>
            <span className="font-medium">{bus.leg_name}</span>
            {` · ${bus.bus_code}`}
            <span className="block text-muted-foreground">
              {formatDateTime(bus.depart_at)}
              {bus.pickup_name ? ` · Đón tại ${bus.pickup_name}` : ""}
              {bus.leader_name ? ` · Trưởng xe ${bus.leader_name}` : ""}
              {bus.leader_phone ? ` ${bus.leader_phone}` : ""}
            </span>
          </p>
        ))}
      </Section>

      <Section title="Phòng" empty={!journey.room} emptyText="Chưa được xếp phòng.">
        {journey.room && (
          <p>
            <span className="font-medium">{journey.room.hotel_name}</span>
            {` · Phòng ${journey.room.room_number}`}
            <span className="block text-muted-foreground">
              {formatDate(journey.room.checkin_date)} → {formatDate(journey.room.checkout_date)}
            </span>
          </p>
        )}
      </Section>

      <Section title="Ghế gala" empty={!seat} emptyText="Chưa có ghế của riêng người này.">
        {seat && (
          <p>
            <span className="font-medium">{seat.table_name ?? seat.table_code}</span>
            {` · Ghế ${seat.seat_number}`}
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  emptyText,
  children,
}: {
  title: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {empty ? <p className="text-muted-foreground">{emptyText}</p> : children}
      </CardContent>
    </Card>
  );
}
