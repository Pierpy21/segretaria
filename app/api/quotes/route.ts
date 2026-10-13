import { apiOk, handleApiError } from "@/lib/api";
import { createQuote, listQuotes } from "@/lib/data/quotes";
import { requireCompany } from "@/lib/db";
import { parseQuoteInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companyId } = await requireCompany();
    return apiOk(await listQuotes(companyId));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { companyId } = await requireCompany();
    const input = parseQuoteInput(await readJsonObject(request));
    return apiOk(await createQuote(companyId, input), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
