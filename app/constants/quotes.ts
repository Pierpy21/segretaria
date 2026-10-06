import { Check, XCircle, Send, FileText } from "lucide-react";
import type { QuoteStatus, StatusMeta } from "@/app/types/quotes";

export const STATUS_META: Record<QuoteStatus, StatusMeta> = {
  pending_ai: {
    label: "Bozza AI in Revisione",
    bg: "#fef9c3",
    text: "#854d0e",
    icon: FileText
  },
  quote_sent: {
    label: "Inviato al Paziente",
    bg: "#dbeafe",
    text: "#1e40af",
    icon: Send
  },
  approved: {
    label: "Accettato dal Paziente",
    bg: "#dcfce7",
    text: "#166534",
    icon: Check
  },
  declined: {
    label: "Non Accettato",
    bg: "#fee2e2",
    text: "#991b1b",
    icon: XCircle
  },
};

