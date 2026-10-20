import type { Sector } from "@/app/types/api";

/** Testi dipendenti dal settore dello studio: unica fonte per onboarding, sidebar e form clienti. */
export const SECTORS: Record<Sector, { label: string; badge: string; subtitle: string; namePlaceholder: string }> = {
  dentale: {
    label: "Dentale",
    badge: "Dental",
    subtitle: "Studio Dentistico Smart AI",
    namePlaceholder: "Es. Studio Dentistico Dott. Rossi",
  },
  medico: {
    label: "Studio medico",
    badge: "Med",
    subtitle: "Studio Medico Smart AI",
    namePlaceholder: "Es. Studio Medico Dott. Bianchi",
  },
  commercialista: {
    label: "Commercialista",
    badge: "Tax",
    subtitle: "Studio Commercialista Smart AI",
    namePlaceholder: "Es. Studio Commerciale Rossi & Associati",
  },
  legale: {
    label: "Studio legale",
    badge: "Legal",
    subtitle: "Studio Legale Smart AI",
    namePlaceholder: "Es. Studio Legale Avv. Verdi",
  },
  estetico: {
    label: "Centro estetico",
    badge: "Beauty",
    subtitle: "Centro Estetico Smart AI",
    namePlaceholder: "Es. Centro Estetico Bellavista",
  },
  generico: {
    label: "Generico",
    badge: "Pro",
    subtitle: "Segreteria Smart AI",
    namePlaceholder: "Es. Studio Rossi & Associati",
  },
};

/** Settori dello studio (onboarding, nuovo cliente). Il valore è il tipo cliente di default. */
export const SECTOR_OPTIONS: readonly { value: Sector; label: string }[] = (Object.keys(SECTORS) as Sector[]).map(
  (value) => ({ value, label: SECTORS[value].label })
);
