import { apiOk, handleApiError } from "@/lib/api";
import { createReminder, listReminders } from "@/lib/data/reminders";
import { withCompany } from "@/lib/db";
import { parseReminderInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withCompany((tx, { companyId }) => listReminders(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    // Body letto prima della tx: nessuna connessione del pool occupata durante l'I/O del client.
    const input = parseReminderInput(await readJsonObject(request));
    return apiOk(await withCompany((tx, { companyId }) => createReminder(tx, companyId, input)), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
