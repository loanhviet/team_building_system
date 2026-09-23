"use client";

import { CalendarDays, X } from "lucide-react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  joinDatetimeLocal,
  splitDatetimeLocal,
  type EventDateOption,
} from "@/lib/datetime";

const QUICK_TIMES = ["06:00", "08:00", "09:00", "12:00", "15:00", "18:00", "20:00"];

export function EventDateTimeField({
  value,
  onChange,
  dateOptions = [],
  constrainToDateOptions = true,
  defaultTime = "08:00",
  defaultDate,
  disabled,
  allowClear = true,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  dateOptions?: EventDateOption[];
  constrainToDateOptions?: boolean;
  defaultTime?: string;
  defaultDate?: string;
  disabled?: boolean;
  allowClear?: boolean;
  ariaLabel: string;
}) {
  const inputId = useId();
  const { date, time } = splitDatetimeLocal(value);
  const effectiveDefaultDate = defaultDate || dateOptions[0]?.value || "";
  const minDate = constrainToDateOptions ? dateOptions[0]?.value : undefined;
  const maxDate = constrainToDateOptions ? dateOptions.at(-1)?.value : undefined;

  const setDate = (nextDate: string) => onChange(joinDatetimeLocal(nextDate, time || defaultTime));
  const setTime = (nextTime: string) => onChange(joinDatetimeLocal(date || effectiveDefaultDate, nextTime));
  const selectedDay = dateOptions.find((option) => option.value === date)?.label;
  const summary = date ? `${selectedDay ?? date}${time ? ` · ${time}` : ""}` : "Chưa chọn";
  const allowFreeDate = !constrainToDateOptions || dateOptions.length === 0;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-2.5">
      <p className="mb-2 text-sm font-medium">{summary}</p>
      {dateOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <CalendarDays className="size-3 text-muted-foreground" aria-hidden="true" />
          {dateOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => setDate(option.value)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors",
                date === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {allowFreeDate && (
        <label className="mt-2 block" htmlFor={`${inputId}-date`}>
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Ngày khác</span>
          <Input
            id={`${inputId}-date`}
            aria-label={`${ariaLabel} - ngày`}
            type="date"
            min={minDate}
            max={maxDate}
            value={date}
            disabled={disabled}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <label className="mr-1 w-36" htmlFor={`${inputId}-time`}>
          <span className="sr-only">Giờ</span>
          <Input
            id={`${inputId}-time`}
            aria-label={`${ariaLabel} - giờ`}
            type="time"
            step="300"
            value={time}
            disabled={disabled}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        {QUICK_TIMES.map((quickTime) => (
          <button
            key={quickTime}
            type="button"
            disabled={disabled || !date}
            onClick={() => setTime(quickTime)}
            className={cn(
              "rounded-md px-1.5 py-1 text-[11px] tabular-nums transition-colors",
              time === quickTime ? "bg-primary/12 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {quickTime}
          </button>
        ))}
        {allowClear && value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" /> Xóa giờ
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Giờ Việt Nam (UTC+7). Có thể nhập chính xác theo phút.</p>
    </div>
  );
}
