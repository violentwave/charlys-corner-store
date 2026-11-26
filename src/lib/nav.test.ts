import { describe, expect, it } from "vitest";

import { accountNav, createNav, exploreNav, helpNav, navItems, primaryNav } from "./nav";

describe("nav groups", () => {
  it("every group is non-empty", () => {
    for (const [name, group] of [
      ["primaryNav", primaryNav],
      ["createNav", createNav],
      ["helpNav", helpNav],
      ["exploreNav", exploreNav],
    ] as const) {
      expect(group.length, `${name} is empty`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate hrefs within a group", () => {
    for (const [name, group] of [
      ["primaryNav", primaryNav],
      ["createNav", createNav],
      ["helpNav", helpNav],
      ["exploreNav", exploreNav],
    ] as const) {
      const hrefs = group.map((item) => item.href);
      expect(new Set(hrefs).size, `${name} repeats an href: ${hrefs.join(", ")}`).toBe(hrefs.length);
    }
  });

  it("accountNav hashes are unique and non-empty", () => {
    expect(accountNav.length).toBeGreaterThan(0);
    expect(new Set(accountNav.map((item) => item.hash)).size).toBe(accountNav.length);
  });

  it("only the header-only groups appear in navItems with a known group value", () => {
    for (const item of navItems) {
      expect(["primary", "create", "help", "explore"]).toContain(item.group);
    }
  });
});

describe("menu lists", () => {
  it("the menu never shows the same link twice (Create vs Explore)", async () => {
    const { menuCreateNav, exploreNav } = await import("./nav");
    const hrefs = [...menuCreateNav, ...exploreNav].map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(menuCreateNav.map((i) => i.href)).toEqual(["/#design", "/#upload"]);
  });
});
