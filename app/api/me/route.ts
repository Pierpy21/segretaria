import { apiOk, handleApiError } from "@/lib/api";
import { getMe } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await getMe());
  } catch (err) {
    return handleApiError(err);
  }
}
