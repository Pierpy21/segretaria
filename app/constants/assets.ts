/** Etichette dei tipi bene (client_assets.asset_type). Tipi non mappati → "Bene" / "Beni". */
export const ASSET_TYPE_LABELS: Record<string, { singolare: string; plurale: string }> = {
  veicolo: { singolare: "Veicolo", plurale: "Veicoli" },
  animale: { singolare: "Animale", plurale: "Animali" },
  immobile: { singolare: "Immobile", plurale: "Immobili" },
  impianto: { singolare: "Impianto", plurale: "Impianti" },
};

export function assetTypeLabel(assetType: string, plurale = false): string {
  const meta = ASSET_TYPE_LABELS[assetType];
  if (!meta) return plurale ? "Beni" : "Bene";
  return plurale ? meta.plurale : meta.singolare;
}
