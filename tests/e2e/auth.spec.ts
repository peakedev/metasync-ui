import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/some-tenant/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows login form with email, password, and google button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("invalid@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in$/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("password reset link navigates to reset page", async ({ page }) => {
    await page.goto("/login");
    await page.getByText(/forgot/i).click();
    await expect(page).toHaveURL(/\/login\/reset/);
  });

  test("403 page shows access denied", async ({ page }) => {
    await page.goto("/403");
    await expect(page.getByText(/access denied|forbidden/i)).toBeVisible();
  });
});
