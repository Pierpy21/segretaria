// Helper e costanti condivisi dal modulo Magazzino (pagina, schede e impostazioni).
// Nessuna direttiva "use client": importabile da componenti client e server.
import type { InventoryCategory, InventoryItemTypeFlag, InventoryMovementType } from "@/app/types/api";

/** Flag di comportamento di un tipo di articolo, con etichetta e descrizione per le impostazioni */
export const ITEM_TYPE_FLAGS: readonly { key: InventoryItemTypeFlag; label: string; hint: string }[] = [
  { key: "trackLot", label: "Traccia lotto", hint: "Ogni giacenza è associata a un lotto." },
  { key: "trackExpiry", label: "Traccia scadenza", hint: "Ogni giacenza ha una data di scadenza." },
  { key: "trackSerial", label: "Matricola", hint: "Ogni unità ha una matricola: la quantità è sempre 1." },
  { key: "consumable", label: "Consumabile (scorta)", hint: "Abilita scorta minima e quantità di riordino." },
  { key: "fractional", label: "Frazionabile", hint: "Lo scarico avviene in un'unità più piccola (fattore di conversione). Non modificabile se il tipo ha già articoli." },
  { key: "sellable", label: "Vendibile", hint: "Richiede prezzo di vendita e IVA sugli articoli." },
  { key: "requiresClientOnIssue", label: "Cliente obbligatorio sullo scarico", hint: "Gli scarichi devono indicare il cliente." },
];

export const MOVEMENT_LABEL: Record<InventoryMovementType, string> = {
  carico: "Carico",
  scarico: "Scarico",
  rettifica: "Rettifica",
  reso: "Reso",
};

/** Classe condivisa dei campi di input del magazzino */
export const INVENTORY_INPUT =
  "w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60 disabled:bg-surface-muted";

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

/** Quantità con al massimo 3 decimali, formato italiano */
export function formatQuantity(value: number): string {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

/** "YYYY-MM-DD" → data locale, senza scarti di fuso */
export function formatIsoDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Timestamp ISO → data e ora locali */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Percorso della categoria: "Padre › Figlia" */
export function categoryPath(categoryId: string | null, categories: readonly InventoryCategory[]): string {
  if (!categoryId) return "—";
  const byId = new Map(categories.map(c => [c.id, c]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.length > 0 ? names.join(" › ") : "—";
}

/** Etichetta del lotto del tipo (es. "DOT" per i pneumatici); senza etichetta = "Lotto" */
export function lotLabelOf(type: { lotLabel: string | null }): string {
  return type.lotLabel?.trim() || "Lotto";
}

/** Unità in cui si esprime la giacenza: unità di scarico se presente, altrimenti di carico */
export function unitOf(item: { unit: string; issueUnit: string | null }): string {
  return item.issueUnit ?? item.unit;
}
