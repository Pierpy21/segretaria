import { apiOk, handleApiError } from "@/lib/api";
import { deleteQuote, updateQuote } from "@/lib/data/quotes";
import { requireCompany } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parseQuotePatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompany();
    const id = parseUuid((await params).id, "id preventivo");
    const patch = parseQuotePatch(await readJsonObject(request));
    return apiOk(await updateQuote(companyId, id, patch));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompany();
    const id = parseUuid((await params).id, "id preventivo");
    if (!(await deleteQuote(companyId, id))) throw new NotFoundError("Preventivo non trovato");
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
