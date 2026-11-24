import { describe, expect, it } from "vitest";

import { contactSchema, quoteSchema, referralSchema } from "./schemas";

describe("contactSchema", () => {
  const ok = { name: "Logan", email: "a@b.co", message: "Hi" };
  it("accepts a minimal valid message", () => {
    expect(contactSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects bad email and empty message", () => {
    const r = contactSchema.safeParse({ ...ok, email: "nope", message: "  " });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["email", "message"]));
  });
  it("requires referralOther when referralSource is other", () => {
    expect(contactSchema.safeParse({ ...ok, referralSource: "other" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, referralSource: "other", referralOther: "flyer" }).success).toBe(true);
  });
  it("allows an empty phone but rejects letters", () => {
    expect(contactSchema.safeParse({ ...ok, phone: "" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...ok, phone: "772-555-0100" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...ok, phone: "call me" }).success).toBe(false);
  });
});

describe("quoteSchema", () => {
  it("coerces quantity from a form string", () => {
    const r = quoteSchema.safeParse({ name: "A", email: "a@b.co", items: "50 tees", quantity: "50" });
    expect(r.success && r.data.quantity).toBe(50);
  });
  it("rejects zero quantity", () => {
    expect(quoteSchema.safeParse({ name: "A", email: "a@b.co", items: "tees", quantity: "0" }).success).toBe(false);
  });
});

describe("referralSchema", () => {
  it("is fully optional", () => {
    expect(referralSchema.safeParse({}).success).toBe(true);
  });
});
