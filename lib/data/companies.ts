import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import type { Sector } from "@/app/types/clients";
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
  templateVersion: number;
}

/**
 * Crea lo studio e iscrive l'utente come owner (funzione SECURITY DEFINER create_company).
 * Applica il preset di settore (apply_vertical_template, SECURITY INVOKER: valgono le policy;
 * copia terminologia, campi, moduli e tipi di appuntamento). L'owner è iscritto dal trigger
 * AFTER INSERT sulla stessa tx. Con seedDemo popola i dati demo nella stessa transazione.
 * Lo slug ha un suffisso casuale; in caso di collisione si riprova.
 */
export async function createCompany(name: string, seedDemo: boolean, sector: Sector): Promise<CreatedCompany> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Il nome dello studio è obbligatorio");

  const tz = getCalendarTimeZone();
  const base = slugify(trimmed);

  for (let attempt = 1; ; attempt++) {
    const slug = `${base}-${randomBytes(3).toString("hex")}`;
    try {
      const created = await withUser(async (tx) => {
        const rows = (await tx.execute(
          sql`select public.create_company(${trimmed}, ${slug}) as id`
        )) as unknown as Array<{ id: string }>;
        const companyId = rows[0]?.id;
        if (!companyId) throw new Error("create_company non ha restituito un id");

        const versions = (await tx.execute(
          sql`select public.apply_vertical_template(${companyId}, ${sector}) as version`
        )) as unknown as Array<{ version: number }>;
        const templateVersion = Number(versions[0]?.version);
        if (!Number.isInteger(templateVersion)) throw new Error("apply_vertical_template non ha restituito una versione");

        if (seedDemo) await seedDemoData(tx, companyId, tz, sector);
        return { id: companyId, templateVersion };
      });
      return { id: created.id, name: trimmed, slug, templateVersion: created.templateVersion };
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
