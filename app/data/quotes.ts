import type { Quote } from "@/app/types/quotes";

export const INITIAL_QUOTES: Quote[] = [
  { id: "PDC-001", client: "Elena Rossi", type: "Implantologia", date: "1 Lug 2026", status: "pending_ai", amount: "€1.450", description: "Impianto osteointegrato Straumann in titanio con moncone ed elemento in zirconio-ceramica.", isAiGenerated: true },
  { id: "PDC-002", client: "Roberto Ferrero", type: "Ortodonzia", date: "30 Giu 2026", status: "quote_sent", amount: "€3.400", description: "Trattamento allineatori trasparenti arcata superiore e inferiore, 24 mascherine con rifinitura inclusa.", isAiGenerated: false },
  { id: "PDC-003", client: "Maria Greco", type: "Igiene & Estetica", date: "29 Giu 2026", status: "approved", amount: "€280", description: "Ablazione tartaro ultrasuoni con airflow al bicarbonato e seduta sbiancamento lampada LED.", isAiGenerated: false },
  { id: "PDC-004", client: "Paolo Mancini", type: "Endodonzia", date: "28 Giu 2026", status: "pending_ai", amount: "€380", description: "Terapia canalare tricanalare elemento 4.6 con ricostruzione composito e perno in fibra di vetro.", isAiGenerated: true },
  { id: "PDC-005", client: "Elena Vitali", type: "Estetica Dentale", date: "27 Giu 2026", status: "quote_sent", amount: "€2.600", description: "Faccette estetiche in ceramica feldspatica settore anteriore superiore (4 elementi).", isAiGenerated: false },
  { id: "PDC-006", client: "Francesca Bianchi", type: "Chirurgia Orale", date: "26 Giu 2026", status: "pending_ai", amount: "€220", description: "Estrazione chirurgica complessa elemento 3.8 (terzo molare inferiore incluso).", isAiGenerated: true },
  { id: "PDC-007", client: "Giancarlo Marchetti", type: "Chirurgia / Protesi", date: "25 Giu 2026", status: "approved", amount: "€6.800", description: "Riabilitazione arcata superiore Toronto Bridge All-on-4 su 4 impianti a carico immediato.", isAiGenerated: false },
];

