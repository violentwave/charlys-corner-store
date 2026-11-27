import { expect, test, type Page } from "@playwright/test";

/**
 * Every side with a design exports a real mockup (2026-11-26 bug: the last side, a sleeve, came
 * out as an empty PNG because the export trusted a stale "active side" mid-switch). Checks the
 * success-screen previews, which are the same blobs that are uploaded and emailed.
 */
const unique = (tag: string) => `${tag}-${Date.now()}-${test.info().workerIndex}@example.com`;

function freshIp(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
}

test("front, back and a sleeve all export non-empty mockups", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop layout drives the side buttons directly");
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email: unique("export") } });
  await page.goto("/");
  await page.getByTestId("garment-longsleeve").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("add-text").click();
  for (const side of ["Back", "Right sleeve"]) {
    await page.getByRole("button", { name: side, exact: true }).first().click();
    await page.getByTestId("add-text").click();
  }
  await page.getByRole("button", { name: "Step 4: Send" }).click();
  await page.getByTestId("send-email").click();
  await expect(page.getByTestId("builder-success")).toBeVisible({ timeout: 60_000 });

  for (const view of ["front", "back", "right"]) {
    const img = page.getByTestId(`mockup-image-${view}`);
    await expect(img).toBeVisible();
    const opaque = await img.evaluate(async (el: HTMLImageElement) => {
      await el.decode();
      const c = document.createElement("canvas");
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const g = c.getContext("2d")!;
      g.drawImage(el, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let k = 3; k < d.length; k += 4) if (d[k]! > 0) n++;
      return n;
    });
    expect(opaque, `${view} mockup is empty`).toBeGreaterThan(10_000);
  }
});
