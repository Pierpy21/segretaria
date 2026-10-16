import type { Sector } from "@/app/types/api";

/** Settori dello studio (onboarding, nuovo cliente). Il valore è il tipo cliente di default. */
export const SECTOR_OPTIONS: readonly { value: Sector; label: string }[] = [
  { value: "dentale", label: "Dentale" },
  { value: "estetico", label: "Centro estetico" },
  { value: "generico", label: "Generico" },
];
