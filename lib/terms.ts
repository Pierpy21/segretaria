// Terminologia dello studio (companies.terms). Nessuna dipendenza server: condiviso client/server.
import type { CompanyRole } from "@/app/types/api";
import type { QuoteStatus } from "@/app/types/quotes";
import type { TermKey, Terms } from "@/app/types/settings";

/** Valori del preset "generico" (vertical_templates): fallback per le etichette mancanti. */
export const DEFAULT_TERMS: Terms = {
  clientSingular: "Cliente",
  clientPlural: "Clienti",
  quoteSingular: "Preventivo",
  quotePlural: "Preventivi",
  ownerTitle: "Titolare",
  memberTitle: "Collaboratore",
  accountantTitle: "Assistente contabile",
  sensitiveData: "Dati riservati",
  tasksLabel: "Attività",
  clientsSubtitle: "Anagrafica clienti e schede con i campi dell'attività",
  chatSubtitle: "Comunicazioni con i clienti e messaggistica",
  agendaSubtitle: "Appuntamenti sincronizzati con Google/Apple",
  tasksSubtitle: "Kanban delle attività operative",
  quotesSubtitle: "Preventivi e accettazione dei clienti",
  statusPendingAi: "Bozza AI in revisione",
  statusSent: "Inviato al cliente",
  statusApproved: "Accettato dal cliente",
  statusDeclined: "Non accettato",
  inventoryLabel: "Magazzino",
  itemSingular: "Articolo",
  itemPlural: "Articoli",
  inventorySubtitle: "Articoli, giacenze e movimenti di magazzino",
};

export const TERM_KEYS = Object.keys(DEFAULT_TERMS) as TermKey[];

/**
 * Unisce le etichette salvate ai default. Ignora chiavi sconosciute, valori non stringa
 * e stringhe vuote (= chiave rimossa, torna il default).
 */
export function resolveTerms(partial: Partial<Terms> | null | undefined): Terms {
  const out: Terms = { ...DEFAULT_TERMS };
  if (!partial || typeof partial !== "object") return out;
  for (const key of TERM_KEYS) {
    const value: unknown = partial[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

const QUOTE_STATUS_TERM: Record<QuoteStatus, TermKey> = {
  pending_ai: "statusPendingAi",
  quote_sent: "statusSent",
  approved: "statusApproved",
  declined: "statusDeclined",
};

export function quoteStatusLabel(terms: Terms, status: QuoteStatus): string {
  return terms[QUOTE_STATUS_TERM[status]];
}

/** Titolo leggibile del ruolo: l'etichetta del ruolo personalizzato, altrimenti quella del dizionario. */
export function roleTitle(terms: Terms, role: CompanyRole, customRoleLabel?: string | null): string {
  if (customRoleLabel) return customRoleLabel;
  if (role === "owner" || role === "admin") return terms.ownerTitle;
  return role === "accountant" ? terms.accountantTitle : terms.memberTitle;
}
