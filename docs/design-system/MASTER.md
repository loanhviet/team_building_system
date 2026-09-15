# Design System Master — Team Building Portal

> **SoT.** Page overrides: `docs/design-system/pages/<slug>.md` (nếu có thì thắng file này).
> Skill `ui-ux-pro-max` (2026-09-14): Minimalism & Swiss, variance 3, motion 2, density 6 (CBNV) / 8 (admin).
> **Khóa:** Be Vietnam Pro + lucide + shadcn. Không Lexend/Playfair. Không hero marketing. Không ticket/boarding-pass. Accent teal vận hành (bỏ pink/lavender skill mặc định).

**Product:** cổng nội bộ — CBNV tự phục vụ hành trình + BTC điều phối nguồn lực. Tiếng Việt. Tin cậy hơn “đẹp”.

Hai persona, một hệ token:

| | CBNV | BTC |
|---|---|---|
| Việc | “Tôi đi lúc nào, ở đâu, hỏi gì được” | “Ai chưa xếp, slot nào đầy, công bố khi nào” |
| Mật độ | 1 cột, `max-w-3xl`, khoảng 16/24 | bảng + KPI, sidebar 240px |
| Nav | bottom ≤5 (icon+nhãn) / top text desktop | sidebar + tab sự kiện |

---

## Anti-patterns (cấm)

- Glassmorphism, gradient tím/hồng, hero marketing, emoji-icon, bento vui, neon, 3D
- Landing social-proof / logo carousel / “Contact Sales”
- **7 thẻ cùng trọng số** (Bay / Xe / KS / Gala / Lịch / TB / Cá nhân) — đó là cấu trúc BRD, không phải IA màn hình
- Ticket spine / boarding-pass cream / ALL-CAPS kicker
- Mix flat + skeuomorphic; raw enum English (`outbound`, `held`)
- Convey status **chỉ bằng màu**
- Font không có subset Vietnamese
- Phosphor / Antd (giữ lucide + shadcn)
- GSAP scroll-reveal trên app nội bộ (chỉ CSS 150–200ms)

---

## Color (map vào `apps/web/src/app/globals.css`)

Skill `--design-system` trả pink `#EC4899` (nhầm beauty/event). **Khóa họ vận hành:**

| Role | Hex | CSS |
|------|-----|-----|
| Night / chrome | `#0F172A` | `--night` |
| Paper / canvas | `#F8FAFC` | `--foam`, `--background` |
| Sea / primary | `#0D9488` | `--lagoon`, `--primary` |
| Primary pressed | `#0F766E` | `--lagoon-deep` |
| On primary | `#F4FFFC` | `--primary-foreground` |
| Ember / attention | `#F97316` | `--ember` (cờ, việc cần làm) |
| Lantern / team-own | `#B91C1C` | `--lantern` |
| Card | `#FFFFFF` | `--card` |
| Foreground | `#0F172A` | `--foreground` |
| Muted fg | `#64748B` | `--muted-foreground` (≥4.5:1 trên paper) |
| Border | `#E2E8F0` | `--border` |
| On night | `#F8FAFC` | `--on-night` |

### Status tokens

Mỗi trạng thái: bg + fg + border + icon lucide + nhãn VI.

| Token | Nhãn | Icon |
|-------|------|------|
| `--status-empty` | Trống | `Circle` |
| `--status-locking` | Đang giữ | `Lock` |
| `--status-confirmed` | Đã xác nhận | `Check` |
| `--status-unavailable` | Không khả dụng | `Ban` |
| `--status-flag` | Cờ ngoại lệ | `Flag` |
| `--status-over-slot` | Vượt slot | `AlertTriangle` |

EventStatus: `draft` muted · `registration_open` empty/lagoon · `registration_closed` unavailable · `allocation_processing` locking · `information_published` confirmed · `event_started` empty · `event_completed` unavailable.

---

## Typography

- **Body + heading:** Be Vietnam Pro (`--font-be-vietnam`, latin+vietnamese).
- **Mono / tabular:** Geist Mono trên giờ bay, mã chuyến, KPI, mã NV.
- Scale: 12 / 14 / 16 / 18 / 24 / 32. Body ≥16px trên mobile input. Line-height 1.5.
- Nhãn phụ: 12–13px medium, **sentence case** — không italic serif, không tracked-out uppercase.

---

## Spacing / density / motion / z-index

CBNV (density 6): `--space-md 8` `--space-lg 12` `--space-xl 16` `--space-2xl 24` `--space-3xl 32`.

Admin (density 8): padding trang 16–24, bảng compact `h-8` controls.

Radius: 4–6px. Shadow: `--shadow-sm` only.

Motion: 150–200ms opacity/transform. `prefers-reduced-motion: reduce` → 0.

Z: base 0 · sticky 30 · sheet 40 · dialog 50 · toast 60.

Breakpoints: 375 / 768 / 1024 / 1440.

`--header-h: 3.5rem` · `--bottom-nav-h: 4.5rem`.

---

## Layout & IA

**CBNV:** 1 cột. Header sticky night. Bottom nav ≤5. **Một việc nổi trên fold** (next/attention). Phần còn lại là **trục thời gian**, không phải catalog module.

**Admin:** sidebar night 240px + EventPicker; main paper; workspace = identity strip + chuyển trạng thái + tab. Bảng `overflow-x-auto`.

**Login:** form trên paper, panel trái **màu đặc night**, không radial-gradient, không vé.

**Chat:** chiếm phần còn lại của viewport; composer sticky trên bottom nav; ngữ cảnh (chuyến/phòng/xe) trên đầu — không khung chat generic.

---

## Components

- `PageHeader` — title + description + actions. Không kicker uppercase.
- `Callout` — info / warn / ok / danger (icon + text, không chỉ màu).
- Buttons: CBNV primary `min-h-11`. Admin dense `h-8` ok.
- Forms: visible label, error dưới field + `aria-describedby`, summary `role="alert"`.
- Tables: `DataTable` + `aria-sort`.
- ConfirmDialog mọi hành động phá huỷ / mail hàng loạt.
- Capacity: `CapacityBar` + remaining text.
- Status: `StatusChip` (icon + text + token).
- Seats: 4 token + “Team bạn” (lantern + nhãn), legend luôn hiện.
- Icons: lucide, `aria-hidden` khi cạnh text.

---

## Stack

Next.js 16 App Router, React 19, Tailwind 4, shadcn, TanStack Query. Mutations qua FastAPI REST — **không** Next Server Actions cho nghiệp vụ. Không đổi API contract trừ field additive (vd. `announcement.id`).

---

## A11y checklist

Contrast 4.5:1 · focus ring 3px · 44px CBNV · keyboard · skip link · không hover-only · drag có alternative · reduced-motion · color + icon/text.
