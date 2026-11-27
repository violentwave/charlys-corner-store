import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Cart screens (docs/04 §5b): Add to cart from the builder, the /cart list, sizes, the
 * whole-cart send and the header badge. /api/cart* is mocked with page.route so the spec
 * tests the UI contract (the API itself is covered by the backend task); the session is
 * real (the test-only /api/test/session helper) so /cart renders for a member.
 */

const ITEM_ID = "aaaaaaaa-1111-4111-8111-111111111111";

type MockItem = {
  id: string;
  garment: string;
  garmentName: string;
  colors: { label: string; name: string; hex: string }[];
  views: { view: string; area: string; method: string; imageUrl: string | null }[];
  sizes: Record<string, number>;
  sizeOptions: string[];
  pieces: number;
  notes: string | null;
  createdAt: string;
};

function cartItem(id = ITEM_ID, sizes: Record<string, number> = {}): MockItem {
  return {
    id,
    garment: "tshirt",
    garmentName: "Gildan 5000 Heavy Cotton Tee",
    colors: [{ label: "Shirt", name: "White", hex: "#ffffff" }],
    views: [{ view: "Front", area: "Full Front", method: "Screen print", imageUrl: null }],
    sizes,
    sizeOptions: ["S", "M", "L", "XL"],
    pieces: Object.values(sizes).reduce((n, qty) => n + qty, 0),
    notes: null,
    createdAt: new Date().toISOString(),
  };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** A tiny in-memory cart behind the real API's paths. */
async function mockCart(page: Page, initial: MockItem[] = []) {
  const items = [...initial];
  await page.route("**/api/cart**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === "/api/cart" && method === "GET") {
      return json(route, { ok: true, items, max: 20, pieces: items.reduce((n, i) => n + i.pieces, 0) });
    }
    if (url.pathname === "/api/cart" && method === "POST") {
      const item = cartItem(items.length === 0 ? ITEM_ID : `${ITEM_ID.slice(0, -1)}${items.length + 1}`);
      items.push(item);
      return json(route, { ok: true, item, count: items.length });
    }
    if (url.pathname === "/api/cart/submit" && method === "POST") {
      const missing = items.filter((item) => item.pieces < 1);
      if (missing.length > 0) {
        return json(
          route,
          {
            ok: false,
            error: "Add sizes and quantities to every item before sending.",
            fieldErrors: Object.fromEntries(missing.map((item) => [item.id, "Add at least one size"])),
          },
          400,
        );
      }
      return json(route, { ok: true, orderId: "order-1", itemCount: items.length });
    }

    const id = url.pathname.split("/").pop()!;
    const item = items.find((entry) => entry.id === id);
    if (method === "PATCH" && item) {
      const body = route.request().postDataJSON() as { sizes?: Record<string, number>; notes?: string };
      if (body.sizes) {
        item.sizes = body.sizes;
        item.pieces = Object.values(body.sizes).reduce((n, qty) => n + qty, 0);
      }
      if (body.notes !== undefined) item.notes = body.notes;
      return json(route, { ok: true, item });
    }
    if (method === "DELETE" && item) {
      items.splice(items.indexOf(item), 1);
      return json(route, { ok: true });
    }
    return json(route, { ok: false, error: "unexpected" }, 404);
  });
}

async function signIn(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.request.post("/api/test/session", {
    data: { email: `cart-${Date.now()}-${test.info().workerIndex}@example.com` },
  });
}

async function openBuilder(page: Page) {
  await page.goto("/design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("builder-canvas")).toBeVisible();
}

async function uploadArtwork(page: Page) {
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("upload-image").click();
  await page.locator("[data-testid='builder-file-input']").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByRole("region", { name: "Selected image" })).toBeVisible({ timeout: 15_000 });
}

test("add to cart from step 4 → badge shows 1 → /cart lists it → sizes → send", async ({ page }) => {
  await signIn(page);
  await mockCart(page);
  await openBuilder(page);
  await uploadArtwork(page);

  await page.getByRole("button", { name: "Step 4: Send" }).click();
  await expect(page.getByTestId("path-cart")).toContainText(/One price for the whole order/i);
  await page.getByTestId("send-cart").click();

  const added = page.getByTestId("cart-added");
  await expect(added).toBeVisible({ timeout: 30_000 });
  await expect(added).toContainText("1 design");
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await added.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByTestId("cart-item")).toHaveCount(1);
  await expect(page.getByTestId("cart-item")).toContainText("Gildan 5000 Heavy Cotton Tee");

  const size = page.getByTestId(`cart-${ITEM_ID}-size-M`);
  await size.fill("2");
  await size.press("Tab");
  await expect(page.getByTestId("cart-item-status")).toHaveText("Saved");
  await expect(page.getByTestId("cart-item-pieces")).toContainText("2 pieces");

  await page.getByTestId("cart-submit").click();
  await expect(page.getByTestId("cart-sent")).toContainText(/Order request sent!/i);
});

test("an empty cart shows the friendly empty state", async ({ page }) => {
  await signIn(page);
  await mockCart(page);
  await page.goto("/cart");
  await expect(page.getByTestId("cart-empty")).toContainText(/Your cart is empty/i);
  await expect(page.getByRole("link", { name: "Design something" })).toHaveAttribute("href", "/#design");
});

test("submitting with a sizeless design highlights that card", async ({ page }) => {
  await signIn(page);
  await mockCart(page, [cartItem()]);
  await page.goto("/cart");
  await expect(page.getByTestId("cart-item")).toHaveCount(1);

  await page.getByTestId("cart-submit").click();
  await expect(page.getByTestId("cart-item-error")).toContainText("Add at least one size");
  await expect(page.getByTestId("cart-item")).toHaveAttribute("data-error", "true");
  await expect(page.getByTestId("cart-submit-error")).toContainText(/Add sizes and quantities/i);
});

test("the cart works keyboard-only: type a size, then Enter sends", async ({ page }) => {
  await signIn(page);
  await mockCart(page, [cartItem()]);
  await page.goto("/cart");
  await expect(page.getByTestId("cart-item")).toHaveCount(1);

  const size = page.getByTestId(`cart-${ITEM_ID}-size-M`);
  await size.focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("3");
  await page.keyboard.press("Tab"); // blur saves the size
  await expect(page.getByTestId("cart-item-status")).toHaveText("Saved");

  await page.getByTestId("cart-submit").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cart-sent")).toBeVisible();
});
