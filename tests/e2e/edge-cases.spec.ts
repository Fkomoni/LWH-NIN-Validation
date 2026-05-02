import { expect, test } from "@playwright/test";

test.describe("auth edge cases", () => {
  test("wrong DOB routes to the /verify chooser", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Enrollee ID").fill("LWH-0001");
    await page.getByLabel("Date of birth").fill("1990-01-01");
    await page.getByLabel(/I consent/).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/couldn't match those details/i)).toBeVisible();
    await page.getByRole("link", { name: /try another way/i }).click();
    await expect(page).toHaveURL(/\/verify\?/);
    await expect(page.getByText(/validate with my nin/i)).toBeVisible();
  });

  test("locked account returns a generic security message", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Enrollee ID").fill("LWH-0006");
    await page.getByLabel("Date of birth").fill("1980-01-01");
    await page.getByLabel(/I consent/).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/paused this account/i)).toBeVisible();
  });
});

test.describe("household edge cases", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Enrollee ID").fill("LWH-0001");
    await page.getByLabel("Date of birth").fill("1985-06-15");
    await page.getByLabel(/I consent/).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/household$/);
  });

  test("invalid NIN format is rejected inline", async ({ page }) => {
    const firstRow = page.getByRole("listitem").first();
    await firstRow.getByLabel(/^NIN$/).fill("12345");
    await firstRow.getByRole("button", { name: /validate/i }).click();
    await expect(firstRow.getByText(/must be exactly 11 digits/i)).toBeVisible();
  });

  test("duplicate NINs across rows are caught client-side", async ({ page }) => {
    const rows = page.getByRole("listitem");
    await rows.nth(0).getByLabel(/^NIN$/).fill("12345678901");
    await rows.nth(1).getByLabel(/^NIN$/).fill("12345678901");
    await rows.nth(0).getByRole("button", { name: /validate/i }).click();
    await expect(page.getByText(/entered more than once/i)).toBeVisible();
  });

  test("hard name-mismatch NIN surfaces a support ref and does not update", async ({ page }) => {
    const row = page.getByRole("listitem").nth(1); // first dependant
    await row.getByLabel(/^NIN$/).fill("10000000001");
    await row.getByRole("button", { name: /validate/i }).click();
    await expect(row.getByText(/doesn't match our records/i)).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText(/Ref:/i)).toBeVisible();
  });
});
