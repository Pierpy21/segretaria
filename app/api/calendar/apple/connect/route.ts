import { apiOk, handleApiError } from "@/lib/api";
import { connectApple, disconnectProvider } from "@/lib/calendar-sync";
import { requireCompany } from "@/lib/db";
import { parseAppleConnectInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { companyId } = await requireCompany();
    const input = parseAppleConnectInput(await readJsonObject(request));
    return apiOk(await connectApple(companyId, input));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE() {
  try {
    const { companyId } = await requireCompany();
    await disconnectProvider(companyId, "apple");
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
