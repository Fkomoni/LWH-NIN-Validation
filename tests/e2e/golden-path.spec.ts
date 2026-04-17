import { expect, test } from "@playwright/test";

test("happy path: principal + 2 dependants validate and land on Done", async ({ page }) => {
  await page.goto("/auth");

  await page.getByLabel("Enrollee ID").fill("LWH-0001");
  await page.getByLabel("Date of birth").fill("1985-06-15");
  await page.getByLabel(/I consent/).check();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page).toHaveURL(/\/household$/);
  await expect(page.getByRole("heading", { name: "Your household" })).toBeVisible();
  await expect(page.getByText("Adekunle Bashorun")).toBeVisible();
  await expect(page.getByText("Adaora Bashorun")).toBeVisible();
  await expect(page.getByText("Zainab Bashorun")).toBeVisible();

  const rows = page.getByRole("listitem");
  await rows.nth(0).getByLabel(/^NIN$/).fill("12345678901");
  await rows.nth(1).getByLabel(/^NIN$/).fill("12345678902");
  await rows.nth(2).getByLabel(/^NIN$/).fill("12345678903");

  await page.getByRole("button", { name: /validate all/i }).click();

  await expect(rows.nth(0).getByText(/updated|validated/i)).toBeVisible({ timeout: 10_000 });
  await expect(rows.nth(1).getByText(/updated|validated/i)).toBeVisible({ timeout: 10_000 });
  await expect(rows.nth(2).getByText(/updated|validated/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("link", { name: /finish/i }).click();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByRole("heading", { name: /thanks/i })).toBeVisible();
});
