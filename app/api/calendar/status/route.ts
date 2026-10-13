import { apiOk, toApiFailure } from "@/lib/calendar-sync/http";
import { getStatus } from "@/lib/calendar-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await getStatus());
  } catch (err) {
    return toApiFailure(err);
  }
}
