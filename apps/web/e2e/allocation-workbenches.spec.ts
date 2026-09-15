import { expect, test } from "@playwright/test";

const viewports = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL ?? "admin@teambuilding.vn");
  await page.locator("#password").fill(process.env.E2E_ADMIN_PASSWORD ?? "admin123");
  await page.getByRole("button", { name: /đăng nhập/i }).click();
  await page.waitForURL(/\/admin/);
}

for (const viewport of viewports) {
  test(`allocation workbenches fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    for (const [path, heading] of [
      ["/admin/events/1/flights", "Phân chuyến bay"],
      ["/admin/events/1/buses", "Phân xe"],
      ["/admin/events/1/hotels", "Workbench phân phòng"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(heading, { exact: false }).first()).toBeVisible();
      const headerBox = await page.locator("header").boundingBox();
      expect(headerBox?.y).toBeGreaterThanOrEqual(0);
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflows).toBe(false);
    }
  });
}
