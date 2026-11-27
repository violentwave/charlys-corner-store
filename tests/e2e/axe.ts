/**
 * Axe without a dependency: axe-core is already in the pnpm store (it ships with
 * eslint-plugin-jsx-a11y), so find it there and inject it. Returns only serious/critical
 * WCAG 2.2 A/AA violations — the bar P52-2b holds the studio shell to.
 */
import fs from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

export type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: string[];
};

function axeScriptPath(): string {
  const root = path.join(process.cwd(), "node_modules");
  const direct = path.join(root, "axe-core", "axe.min.js");
  if (fs.existsSync(direct)) return direct;
  const store = path.join(root, ".pnpm");
  const entries = fs.existsSync(store) ? fs.readdirSync(store) : [];
  const pkg = entries.find((name) => name.startsWith("axe-core@"));
  if (!pkg)
    throw new Error("axe-core is not in node_modules/.pnpm — run pnpm install (it comes with eslint-plugin-jsx-a11y)");
  return path.join(store, pkg, "node_modules", "axe-core", "axe.min.js");
}

type AxeWindow = {
  axe: {
    run: (
      context: Document | Element,
      options: unknown,
    ) => Promise<{
      violations: Array<{
        id: string;
        impact: string | null;
        help: string;
        nodes: Array<{ target: string[] }>;
      }>;
    }>;
  };
};

export async function axeViolations(page: Page, selector?: string): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: axeScriptPath() });
  const violations = await page.evaluate(async (scope) => {
    const { axe } = window as unknown as AxeWindow;
    const context = scope ? document.querySelector(scope) : document;
    if (!context) throw new Error(`axe context not found: ${scope}`);
    const result = await axe.run(context, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    }));
  }, selector);
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}
