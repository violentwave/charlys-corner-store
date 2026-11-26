import { expect, test } from "@playwright/test";
import { Pool } from "pg";

test("contact submit shows thank-you and stores a row", async ({ page }) => {
  const suffix = `${Date.now()}${test.info().workerIndex}`;
  const email = `logan-${suffix}@example.com`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${test.info().workerIndex + 1}` });
  await page.goto("/contact");
  await page.getByLabel(/Name/i).fill("Logan");
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Message/i).fill("Hello from e2e");
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("");
  await page.getByRole("button", { name: /send message/i }).click();
  await expect(page.getByText("Thanks!", { exact: true })).toBeVisible();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query("select * from contact_messages where email = $1", [email]);
    expect(rows).toHaveLength(1);
  } finally {
    await pool.end();
  }
});

test("home survey submit shows success", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${test.info().workerIndex + 1}` });
  await page.goto("/");
  await page.getByTestId("survey").getByRole("combobox").click();
  await page.getByRole("option", { name: "Friend" }).click();
  await expect(page.getByTestId("survey").getByTestId("turnstile-token")).not.toHaveValue("");
  await page.getByTestId("survey").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByTestId("survey").getByText("Thanks!", { exact: true })).toBeVisible();
});
