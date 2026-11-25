import "server-only";

import { sql } from "drizzle-orm";

import type { Db } from "./db";
import type { REFERRAL_SOURCES } from "./schemas";

export type LeadInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
  referralSource?: (typeof REFERRAL_SOURCES)[number] | null;
  referralOther?: string | null;
  /** Only ever turns opt-in on; an unchecked box never revokes an earlier yes. */
  marketingOptIn?: boolean;
};

/**
 * Insert or update the lead for this email (case-insensitive) and return its id.
 * Newer non-empty values win; empty values never erase what we already have.
 * Raw SQL because Drizzle's onConflictDoUpdate can't target the lower(email) expression index.
 */
export async function upsertLead(db: Db, input: LeadInput): Promise<string> {
  const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);
  const email = input.email.trim().toLowerCase();
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into leads (email, name, phone, referral_source, referral_other, marketing_opt_in)
    values (${email}, ${clean(input.name)}, ${clean(input.phone)}, ${input.referralSource ?? null}, ${clean(input.referralOther)}, ${input.marketingOptIn === true})
    on conflict ((lower(email))) do update set
      name = coalesce(excluded.name, leads.name),
      phone = coalesce(excluded.phone, leads.phone),
      referral_source = coalesce(excluded.referral_source, leads.referral_source),
      referral_other = coalesce(excluded.referral_other, leads.referral_other),
      marketing_opt_in = leads.marketing_opt_in or excluded.marketing_opt_in,
      updated_at = now()
    returning id
  `);
  return rows[0]!.id;
}
