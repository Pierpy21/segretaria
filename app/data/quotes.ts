import type { Quote } from "@/app/types/quotes";

export const INITIAL_QUOTES: Quote[] = [
  { id: "Q-001", client: "Anna Bianchi", type: "Plumber", date: "Jul 1, 2026", status: "pending_ai", amount: "€280", description: "Emergency pipe repair, bathroom sink.", isAiGenerated: true },
  { id: "Q-002", client: "Roberto Conti", type: "Electrician", date: "Jun 30, 2026", status: "quote_sent", amount: "€450", description: "Electrical rewiring, 3rd floor apartment, Via Roma 14.", isAiGenerated: false },
  { id: "Q-003", client: "Maria Greco", type: "Carpenter", date: "Jun 29, 2026", status: "approved", amount: "€1,200", description: "Custom shelving unit, oak wood, living room.", isAiGenerated: false },
  { id: "Q-004", client: "Paolo Mancini", type: "Plumber", date: "Jun 28, 2026", status: "pending_ai", amount: "€160", description: "Faucet replacement, kitchen sink, quick job.", isAiGenerated: true },
  { id: "Q-005", client: "Elena Vitali", type: "Painter", date: "Jun 27, 2026", status: "quote_sent", amount: "€820", description: "Interior wall painting, 2 bedrooms, matte finish.", isAiGenerated: false },
  { id: "Q-006", client: "Francesca Rossi", type: "Plumber", date: "Jun 26, 2026", status: "pending_ai", amount: "€520", description: "Hot water tank installation and setup.", isAiGenerated: true },
  { id: "Q-007", client: "Giancarlo Bianchi", type: "Carpenter", date: "Jun 25, 2026", status: "approved", amount: "€2,100", description: "Kitchen cabinet design and installation, custom hardware.", isAiGenerated: false },
];
