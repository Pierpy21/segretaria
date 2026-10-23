import type { ClientAttributeValue, ClientAttributes, TyreCatalogEntry } from "@/app/types/api";

/**
 * Campi di misura: il blocco catalogo compare solo se il tipo articolo ha tutti e tre
 * (larghezza, serie, diametro). Nessun controllo sul nome del tipo.
 */
export const TYRE_SIZE_FIELD_KEYS = ["larghezza", "serie", "diametro"] as const;

/**
 * Chiave campo personalizzato ↔ valore ricavato dalla scheda EPREL.
 * Unico punto da cambiare per mappare nuovi campi. "stagione" non è mappata (EPREL non la distingue).
 */
const TYRE_FIELD_READERS: Readonly<Record<string, (entry: TyreCatalogEntry) => ClientAttributeValue>> = {
  larghezza: e => e.width,
  serie: e => e.ratio,
  diametro: e => e.rim,
  indice_carico: e => e.loadIndex,
  codice_velocita: e => e.speedSymbol,
  marca: e => (e.brand ? brandText(e.brand) : null),
  modello: e => e.commercialName,
  classe_consumo: e => e.fuelClass,
  classe_bagnato: e => e.wetGripClass,
  classe_rumore: e => tyreNoiseLabel(e),
  numero_eprel: e => e.registrationNumber,
};

/** Unisce i pezzi non vuoti; null se non resta nulla */
function joinParts(parts: (string | null | undefined | false)[], separator: string): string | null {
  const text = parts.filter(Boolean).join(separator);
  return text || null;
}

/** true se il tipo articolo ha tutti i campi di misura (le chiavi arrivano da GET /api/clients/fields) */
export function hasTyreSizeFields(fieldKeys: readonly string[]): boolean {
  return TYRE_SIZE_FIELD_KEYS.every(key => fieldKeys.includes(key));
}

/** Valori da precompilare: solo i campi presenti nel tipo e con un valore nel catalogo */
export function tyreAttributesFor(entry: TyreCatalogEntry, fieldKeys: readonly string[]): ClientAttributes {
  const attributes: ClientAttributes = {};
  for (const key of fieldKeys) {
    const read = TYRE_FIELD_READERS[key];
    if (!read) continue;
    const value = read(entry);
    if (value !== null) attributes[key] = value;
  }
  return attributes;
}

/** Marca tutta maiuscola (es. "MICHELIN") → Title Case; altrimenti invariata */
function brandText(brand: string): string {
  if (brand !== brand.toUpperCase()) return brand;
  return brand.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Misura leggibile: "205/55 R16" (o la designazione EPREL se mancano i valori numerici) */
export function tyreSizeLabel(entry: TyreCatalogEntry): string | null {
  if (entry.width && entry.ratio && entry.rim) return `${entry.width}/${entry.ratio} R${entry.rim}`;
  return entry.sizeDesignation;
}

/** Indice di carico e codice velocità: "91V" */
export function tyreLoadLabel(entry: TyreCatalogEntry): string | null {
  return joinParts([entry.loadIndex, entry.speedSymbol], "");
}

/** Classe rumore con decibel: "B · 71 dB" */
export function tyreNoiseLabel(entry: TyreCatalogEntry): string | null {
  return joinParts([entry.noiseClass, entry.noiseDb !== null ? `${entry.noiseDb} dB` : null], " · ");
}

/** Nome articolo: "Michelin Primacy 4 205/55 R16 91V" */
export function tyreItemName(entry: TyreCatalogEntry): string {
  const brand = entry.brand ? brandText(entry.brand) : null;
  return joinParts([brand, entry.commercialName, tyreSizeLabel(entry), tyreLoadLabel(entry)], " ") ?? "";
}
