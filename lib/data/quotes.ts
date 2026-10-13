import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { quotes, type Quote as QuoteRow } from "@/drizzle/schema";
import type { Quote, QuoteStatus } from "@/app/types/quotes";
import type { CreateQuoteInput } from "@/app/types/api";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  assertUuid,
  dateInZone,
  first,
  formatEuro,
  formatItalianShort,
  parseDateInput,
} from "./format";

export interface QuotePatch extends Partial<CreateQuoteInput> {
  status?: QuoteStatus;
}

function toQuote(row: QuoteRow): Quote {
  return {
    id: row.id,
    client: row.client,
    type: row.quoteType,
    date: formatItalianShort(row.quoteDate),
    status: row.status,
    amount: formatEuro(Number(row.amount)),
    description: row.description,
    isAiGenerated: row.isAiGenerated,
  };
}

function assertAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new ValidationError("Importo non valido");
  return amount.toFixed(2);
}

/** Data input (ISO o "1 Lug 2026"); se assente usa la data odierna. */
function resolveDate(input: string | undefined): string {
  if (input === undefined) return dateInZone(new Date(), getCalendarTimeZone());
  const parsed = parseDateInput(input);
  if (!parsed) throw new ValidationError("Data preventivo non valida");
  return parsed;
}

export async function listQuotes(companyId: string): Promise<Quote[]> {
  const rows = await withUser((tx) =>
    tx
      .select()
      .from(quotes)
      .where(eq(quotes.companyId, companyId))
      .orderBy(desc(quotes.quoteDate), desc(quotes.createdAt))
  );
  return rows.map(toQuote);
}

export async function createQuote(companyId: string, input: CreateQuoteInput): Promise<Quote> {
  const amount = assertAmount(input.amount);
  const quoteDate = resolveDate(input.date);

  return withUser(async (tx) => {
    const inserted = await tx
      .insert(quotes)
      .values({
        companyId,
        client: input.client,
        quoteType: input.type,
        quoteDate,
        amount,
        description: input.description ?? "",
        isAiGenerated: false,
      })
      .returning();
    return toQuote(first(inserted, "insert quotes"));
  });
}

export async function updateQuote(companyId: string, id: string, patch: QuotePatch): Promise<Quote> {
  assertUuid(id, "id preventivo");

  return withUser(async (tx) => {
    const updated = await tx
      .update(quotes)
      .set({
        ...(patch.client !== undefined ? { client: patch.client } : {}),
        ...(patch.type !== undefined ? { quoteType: patch.type } : {}),
        ...(patch.amount !== undefined ? { amount: assertAmount(patch.amount) } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.date !== undefined ? { quoteDate: resolveDate(patch.date) } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))
      .returning();
    const row = updated[0];
    if (!row) throw new NotFoundError("Preventivo non trovato");
    return toQuote(row);
  });
}

/** Ritorna false se il preventivo non esiste nello studio. */
export async function deleteQuote(companyId: string, id: string): Promise<boolean> {
  assertUuid(id, "id preventivo");
  const deleted = await withUser((tx) =>
    tx
      .delete(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))
      .returning({ id: quotes.id })
  );
  return deleted.length > 0;
}
