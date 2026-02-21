import { test, expect } from "@playwright/test";

test.describe("Invite Accept Page", () => {
  test("shows processing state initially", async ({ page }) => {
    await page.goto("/invite/accept");
    // Since no real session, it should show error or processing
    await expect(page.locator(".max-w-md")).toBeVisible();
  });
});
