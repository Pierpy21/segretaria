import { apiOk, toApiFailure } from "@/lib/calendar-sync/http";
import { connectApple, disconnectProvider } from "@/lib/calendar-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return apiOk(await connectApple());
  } catch (err) {
    return toApiFailure(err);
  }
}

export async function DELETE() {
  try {
    await disconnectProvider("apple");
    return apiOk(null);
  } catch (err) {
    return toApiFailure(err);
  }
}
