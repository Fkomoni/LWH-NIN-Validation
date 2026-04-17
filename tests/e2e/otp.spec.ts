import { expect, test } from "@playwright/test";

test("OTP recovery flow lands at /household", async ({ page }) => {
  // Trigger DOB mismatch so we land at /verify.
  await page.goto("/auth");
  await page.getByLabel("Enrollee ID").fill("LWH-0008");
  await page.getByLabel("Date of birth").fill("1900-01-01");
  await page.getByLabel(/I consent/).check();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("link", { name: /try another way/i }).click();

  // Pick OTP.
  await page.getByRole("radio", { name: /send an otp to my phone/i }).check();
  await page.getByRole("button", { name: /send otp/i }).click();
  await expect(page.getByText(/we sent a 6-digit code/i)).toBeVisible({ timeout: 10_000 });

  await page.getByLabel(/6-digit code/i).fill("123456");
  await page.getByRole("button", { name: /verify and continue/i }).click();

  await expect(page).toHaveURL(/\/household$/);
  await expect(page.getByRole("heading", { name: /your household/i })).toBeVisible();
});
