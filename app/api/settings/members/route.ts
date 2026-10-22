import { apiOk, handleApiError } from "@/lib/api";
import { getMembersOverview } from "@/lib/data/members";
import { withPermission } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Membri dello studio e inviti in attesa (members:manage). */
export async function GET() {
  try {
    return apiOk(await withPermission("members:manage", (tx, ctx) => getMembersOverview(tx, ctx)));
  } catch (err) {
    return handleApiError(err);
  }
}
