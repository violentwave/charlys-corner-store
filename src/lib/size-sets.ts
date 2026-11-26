import type { schema } from "./db";

export type SizeSet = {
  id: string;
  name: string;
  sizes: Record<string, number>;
  roster: { name: string; size: string; number?: string }[];
  updatedAt: string;
};

export const toSizeSet = (row: typeof schema.sizeSets.$inferSelect): SizeSet => ({
  id: row.id,
  name: row.name,
  sizes: row.sizes,
  roster: row.roster,
  updatedAt: row.updatedAt.toISOString(),
});
