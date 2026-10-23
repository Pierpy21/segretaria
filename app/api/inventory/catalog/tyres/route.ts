import type { NextRequest } from "next/server";
import type { TyreCatalogResponse } from "@/app/types/api";
import { apiOk, handleApiError } from "@/lib/api";
import { withModule } from "@/lib/db";
import { isEprelCatalogAvailable, searchEprelTyres } from "@/lib/eprel/tyres";
import { parseTyreCatalogQuery } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Catalogo pneumatici EPREL (sola lettura). Query: width, ratio, rim, brand (facoltativo).
 * Senza parametri: solo la disponibilità del catalogo. Chiave EPREL assente → nessuna chiamata esterna.
 */
export async function GET(request: NextRequest) {
  try {
    return apiOk(
      await withModule("inventory", "inventory:write", async (): Promise<TyreCatalogResponse> => {
        // Validazione dopo l'autenticazione: senza sessione sempre 401.
        const query = parseTyreCatalogQuery(request.nextUrl.searchParams);
        if (!isEprelCatalogAvailable()) return { catalogAvailable: false, results: [] };
        if (!query) return { catalogAvailable: true, results: [] };
        return { catalogAvailable: true, results: await searchEprelTyres(query) };
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
