import { apiOk, handleApiError } from "@/lib/api";
import { createReminder, listReminders } from "@/lib/data/reminders";
import { requireCompany } from "@/lib/db";
import { parseReminderInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companyId } = await requireCompany();
    return apiOk(await listReminders(companyId));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { companyId } = await requireCompany();
    const input = parseReminderInput(await readJsonObject(request));
    return apiOk(await createReminder(companyId, input), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
