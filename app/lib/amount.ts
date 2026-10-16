/**
 * Converte l'importo digitato/memorizzato in numero. Accetta "1450", "1.450", "1.450,50", "€1.450".
 * I punti sono separatori delle migliaia solo nel formato "1.450" o "1.450,50".
 */
export function parseAmount(input: string): number | null {
  let s = input.replace(/[€\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Totale in euro, es. 16400 → "16.400 €" */
export function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
