import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { ConflictError, ValidationError, pgConstraintName } from "@/lib/errors";
import { seedDemoData } from "./seed";
import { slugify } from "./format";

const MAX_SLUG_ATTEMPTS = 3;
const ALREADY_MEMBER_CONSTRAINT = "create_company_already_member";
const SLUG_CONSTRAINT = "companies_slug_key";

export interface CreatedCompany {
  id: string;
  name: string;
  slug: string;
}

/**
 * Crea lo studio e iscrive l'utente come owner (funzione SECURITY DEFINER create_company).
 * Con seedDemo popola i dati demo nella stessa transazione.
 * Lo slug ha un suffisso casuale; in caso di collisione si riprova.
 */
export async function createCompany(name: string, seedDemo: boolean): Promise<CreatedCompany> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Il nome dello studio è obbligatorio");

  const tz = getCalendarTimeZone();
  const base = slugify(trimmed);

  for (let attempt = 1; ; attempt++) {
    const slug = `${base}-${randomBytes(3).toString("hex")}`;
    try {
      const id = await withUser(async (tx) => {
        const rows = (await tx.execute(
          sql`select public.create_company(${trimmed}, ${slug}) as id`
        )) as unknown as Array<{ id: string }>;
        const companyId = rows[0]?.id;
        if (!companyId) throw new Error("create_company non ha restituito un id");

        if (seedDemo) await seedDemoData(tx, companyId, tz);
        return companyId;
      });
      return { id, name: trimmed, slug };
    } catch (err) {
      const constraint = pgConstraintName(err);
      if (constraint === ALREADY_MEMBER_CONSTRAINT) {
        throw new ConflictError("Sei già membro di uno studio");
      }
      // Retry solo sulla collisione dello slug, non su altri 23505
      if (constraint !== SLUG_CONSTRAINT || attempt >= MAX_SLUG_ATTEMPTS) throw err;
    }
  }
}
