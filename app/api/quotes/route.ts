import { apiOk, handleApiError } from "@/lib/api";
import { createQuote, listQuotes } from "@/lib/data/quotes";
import { withCompany } from "@/lib/db";
import { parseQuoteInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withCompany((tx, { companyId }) => listQuotes(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseQuoteInput(await readJsonObject(request));
    return apiOk(await withCompany((tx, { companyId }) => createQuote(tx, companyId, input)), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
