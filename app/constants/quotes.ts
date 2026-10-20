import { Check, XCircle, Send, FileText } from "lucide-react";
import type { QuoteStatus, StatusMeta } from "@/app/types/quotes";
import type { Terms } from "@/app/types/settings";
import { quoteStatusLabel } from "@/lib/terms";

/** Colori e icone degli stati (costanti UI). Le etichette arrivano dalla terminologia dello studio. */
const STATUS_STYLE: Record<QuoteStatus, Omit<StatusMeta, "label">> = {
  pending_ai: { bg: "#fef9c3", text: "#854d0e", icon: FileText },
  quote_sent: { bg: "#dbeafe", text: "#1e40af", icon: Send },
  approved: { bg: "#dcfce7", text: "#166534", icon: Check },
  declined: { bg: "#fee2e2", text: "#991b1b", icon: XCircle },
};

/** Mappa stato → etichetta e colori, per QuotesTable e i filtri. */
export function quoteStatusMap(terms: Terms): Record<QuoteStatus, { label: string; bg: string; text: string }> {
  const out = {} as Record<QuoteStatus, { label: string; bg: string; text: string }>;
  for (const status of Object.keys(STATUS_STYLE) as QuoteStatus[]) {
    const { bg, text } = STATUS_STYLE[status];
    out[status] = { label: quoteStatusLabel(terms, status), bg, text };
  }
  return out;
}
