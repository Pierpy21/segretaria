import type { ChatListItem, Message } from "@/app/types/messaging";

export const INITIAL_CHAT_MESSAGES: ChatListItem[] = [
  { id: 1, name: "Elena Rossi", snippet: "Urgenza: ho un dolore forte al molare...", time: "2m", unread: 3, ai: true, initials: "ER", color: "#ef4444" },
  { id: 2, name: "Matteo Bianchi", snippet: "Disponibilità per igiene e controllo?", time: "15m", unread: 1, ai: true, initials: "MB", color: "#0d9488" },
  { id: 3, name: "Giulia Conti", snippet: "Grazie per il piano ortodontico Invisalign!", time: "1h", unread: 0, ai: false, initials: "GC", color: "#8b5cf6" },
  { id: 4, name: "Roberto Ferrero", snippet: "Indicazioni per l'impianto di giovedì", time: "2h", unread: 0, ai: false, initials: "RF", color: "#3b82f6" },
  { id: 5, name: "Valentina Moretti", snippet: "Confermo seduta sbiancamento lunedì ore 15", time: "3h", unread: 0, ai: true, initials: "VM", color: "#f59e0b" },
];

export const INITIAL_CONVERSATIONS: Record<number, Message[]> = {
  1: [
    { id: 1, from: "contact", text: "Buongiorno studio, ho un dolore fortissimo al molare da stanotte e gengiva gonfia. Avete un posto urgente oggi?", time: "09:12" },
    { id: 2, from: "ai-draft", text: "Buongiorno Elena, comprendiamo l'urgenza. Il Dott. Renzi ha uno slot per emergenze oggi alle 11:30 in Poltrona 1. Nel frattempo eviti cibi troppo caldi o freddi. Confermiamo l'orario?", time: "09:13" },
  ],
  2: [
    { id: 1, from: "contact", text: "Salve, mi è arrivato il promemoria per l'igiene semestrale. Quando c'è disponibilità con l'igienista?", time: "08:40" },
    { id: 2, from: "ai-draft", text: "Buongiorno Matteo! Abbiamo disponibilità per la seduta di igiene e ablazione tartaro giovedì alle 10:00 o venerdì alle 16:30. Quale preferisce?", time: "08:41" },
  ],
  3: [
    { id: 1, from: "user", text: "Buongiorno Giulia, le abbiamo allegato il piano di trattamento 3D e il preventivo per gli allineatori trasparenti.", time: "10:15" },
    { id: 2, from: "contact", text: "Grazie per il piano ortodontico Invisalign! Nei prossimi giorni passo a confermare.", time: "11:00" },
  ],
  4: [
    { id: 1, from: "contact", text: "Buongiorno, posso avere le indicazioni pre-operatorie per l'impianto di giovedì mattina?", time: "07:30" },
    { id: 2, from: "user", text: "Buongiorno Roberto! Le abbiamo appena inviato via mail il protocollo pre-chirurgico e la profilassi prescritta dal Dott. Renzi. Ci vediamo giovedì alle 09:00.", time: "08:00" },
  ],
  5: [
    { id: 1, from: "user", text: "Gentile Valentina, le ricordiamo l'appuntamento per il ciclo di sbiancamento LED professionale lunedì alle 15:00.", time: "06:45" },
    { id: 2, from: "contact", text: "Confermo seduta sbiancamento lunedì ore 15! Grazie mille.", time: "07:10" },
  ],
};

