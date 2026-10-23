import "server-only";
import type { TyreCatalogEntry, TyreCatalogQuery } from "@/app/types/api";
import { ExternalServiceError } from "@/lib/errors";

// Adattatore isolato all'API pubblica EPREL (etichetta energetica pneumatici, UE 2017/1369).
// Tutto il mapping dei nomi campo sta in questo file. Fonti dei nomi:
//   - github.com/maschmann/eprel-public-api-client
//   - github.com/MatteoMiotello/tyredrop (tyre_response.go)
// I nomi dei parametri di filtro (tyreSection, aspectRatio, rimDiameter, supplierOrTrademark)
// sono dedotti dai campi: vanno verificati con una chiave EPREL reale.
// Chiave in EPREL_API_KEY: solo lato server, mai in log, mai nelle risposte.

const EPREL_TYRES_URL = "https://eprel.ec.europa.eu/api/products/tyres";
const PAGE_LIMIT = 25;
const TIMEOUT_MS = 8000;
const INVALID_RESPONSE = "Risposta EPREL non valida";

/** Scheda grezza: tutti i campi facoltativi, tipi non garantiti dal servizio. */
export interface EprelTyreRaw {
  eprelRegistrationNumber?: unknown;
  supplierOrTrademark?: unknown;
  commercialName?: unknown;
  additionalDetails?: { commercialName?: unknown } | null;
  modelIdentifier?: unknown;
  sizeDesignation?: unknown;
  tyreSection?: unknown;
  aspectRatio?: unknown;
  rimDiameter?: unknown;
  loadCapacityIndex?: unknown;
  loadCapacityIndex2?: unknown;
  speedCategorySymbol?: unknown;
  tyreClass?: unknown;
  energyClass?: unknown;
  wetGripClass?: unknown;
  externalRollingNoiseClass?: unknown;
  externalRollingNoiseValue?: unknown;
  severeSnowTyre?: unknown;
  iceTyre?: unknown;
}

/** Chiave EPREL presente: se manca, la route risponde senza chiamare il servizio. */
export function isEprelCatalogAvailable(): boolean {
  return Boolean(process.env.EPREL_API_KEY?.trim());
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Stringa non vuota (i numeri diventano stringa). */
function text(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  return v.trim() || null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function flag(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function toEntry(raw: EprelTyreRaw): TyreCatalogEntry {
  // Doppio indice di carico (es. "91/89"): solo se presente il secondo.
  const loadA = text(raw.loadCapacityIndex);
  const loadB = text(raw.loadCapacityIndex2);
  return {
    registrationNumber: text(raw.eprelRegistrationNumber),
    brand: text(raw.supplierOrTrademark),
    // Il nome commerciale sta a volte in additionalDetails: fallback sul codice modello.
    commercialName: text(raw.commercialName) ?? text(raw.additionalDetails?.commercialName) ?? text(raw.modelIdentifier),
    modelIdentifier: text(raw.modelIdentifier),
    sizeDesignation: text(raw.sizeDesignation),
    width: num(raw.tyreSection),
    ratio: num(raw.aspectRatio),
    rim: num(raw.rimDiameter),
    loadIndex: loadA && loadB ? `${loadA}/${loadB}` : loadA,
    speedSymbol: text(raw.speedCategorySymbol),
    tyreClass: text(raw.tyreClass),
    fuelClass: text(raw.energyClass),
    wetGripClass: text(raw.wetGripClass),
    noiseClass: text(raw.externalRollingNoiseClass),
    noiseDb: num(raw.externalRollingNoiseValue),
    snow: flag(raw.severeSnowTyre),
    ice: flag(raw.iceTyre),
  };
}

/** Risposta: { hits: [...] } (formato atteso), oppure array o { content: [...] }. */
function extractHits(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isRecord(body)) {
    if (Array.isArray(body.hits)) return body.hits;
    if (Array.isArray(body.content)) return body.content;
  }
  throw new ExternalServiceError(INVALID_RESPONSE, 502);
}

/** Cerca pneumatici per misura (larghezza, serie, cerchio) e marca facoltativa. */
export async function searchEprelTyres(query: TyreCatalogQuery): Promise<TyreCatalogEntry[]> {
  const apiKey = process.env.EPREL_API_KEY?.trim();
  if (!apiKey) throw new ExternalServiceError("Catalogo EPREL non configurato", 503);

  const url = new URL(EPREL_TYRES_URL);
  url.searchParams.set("_page", "1");
  url.searchParams.set("_limit", String(PAGE_LIMIT));
  url.searchParams.set("tyreSection", String(query.width));
  url.searchParams.set("aspectRatio", String(query.ratio));
  url.searchParams.set("rimDiameter", String(query.rim));
  const brand = query.brand?.trim().toUpperCase();
  if (brand) url.searchParams.set("supplierOrTrademark", brand);

  // Nessun log qui: né chiave né URL con header (l'errore di rete non viene mai stampato).
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExternalServiceError("Catalogo EPREL non raggiungibile, riprova più tardi", 503);
  }

  if (res.status === 401 || res.status === 403) {
    throw new ExternalServiceError("Chiave EPREL non valida o non autorizzata", 502);
  }
  if (res.status === 429) {
    throw new ExternalServiceError("Troppe richieste al catalogo EPREL, riprova tra poco", 429);
  }
  if (!res.ok) throw new ExternalServiceError(INVALID_RESPONSE, 502);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ExternalServiceError(INVALID_RESPONSE, 502);
  }
  return extractHits(body).filter(isRecord).map((hit) => toEntry(hit as EprelTyreRaw));
}
