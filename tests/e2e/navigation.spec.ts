import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("root page loads without errors", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(500);
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("MetaSync UI")).toBeVisible();
  });

  test("password reset page renders correctly", async ({ page }) => {
    await page.goto("/login/reset");
    await expect(page.getByText(/reset.*password/i)).toBeVisible();
  });

  test("update password page renders correctly", async ({ page }) => {
    await page.goto("/login/update-password");
    await expect(page.getByText(/update.*password/i)).toBeVisible();
  });
});
