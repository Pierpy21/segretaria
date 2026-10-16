import type { CompanyRole, MeResponse } from "@/app/types/api";
import { apiFail, apiOk, handleApiError } from "@/lib/api";
import { createCompany } from "@/lib/data/companies";
import { getMe } from "@/lib/db";
import { parseOnboardingInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await getMe();
    if (me.company) return apiFail("Hai già uno studio associato", 409);

    const input = parseOnboardingInput(await readJsonObject(request));
    const created = await createCompany(input.name, input.seedDemo);

    const role: CompanyRole = "owner";
    const company: NonNullable<MeResponse["company"]> = {
      id: created.id,
      name: created.name,
      slug: created.slug,
      role,
    };
    return apiOk(company, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
