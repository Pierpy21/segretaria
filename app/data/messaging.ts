import type { ChatListItem, Message } from "@/app/types/messaging";

export const INITIAL_CHAT_MESSAGES: ChatListItem[] = [
  { id: 1, name: "Marco Rossi", snippet: "Ho bisogno di un idraulico urgente...", time: "2m", unread: 3, ai: true, initials: "MR", color: "#3b82f6" },
  { id: 2, name: "Giulia Ferrari", snippet: "Quando è disponibile per giovedì?", time: "15m", unread: 1, ai: true, initials: "GF", color: "#0d9488" },
  { id: 3, name: "Luca Esposito", snippet: "Grazie per il preventivo ricevuto!", time: "1h", unread: 0, ai: false, initials: "LE", color: "#8b5cf6" },
  { id: 4, name: "Sofia Romano", snippet: "Posso fissare un appuntamento per...", time: "2h", unread: 0, ai: false, initials: "SR", color: "#f59e0b" },
  { id: 5, name: "Andrea Marino", snippet: "Conferma appuntamento domani alle 9", time: "3h", unread: 0, ai: true, initials: "AM", color: "#ef4444" },
];

export const INITIAL_CONVERSATIONS: Record<number, Message[]> = {
  1: [
    { id: 1, from: "contact", text: "Ho bisogno di un idraulico urgente...", time: "09:12" },
    { id: 2, from: "ai-draft", text: "Buongiorno Marco! Ho verificato la disponibilità: possiamo mandare un tecnico oggi alle 16:00. Confermi l'appuntamento?", time: "09:13" },
  ],
  2: [
    { id: 1, from: "contact", text: "Quando è disponibile per giovedì?", time: "08:40" },
    { id: 2, from: "ai-draft", text: "Buongiorno Giulia! Abbiamo disponibilità giovedì alle 10:00 o alle 15:30. Quale preferisce?", time: "08:41" },
  ],
  3: [
    { id: 1, from: "user", text: "Ecco il preventivo richiesto, mi faccia sapere.", time: "1h" },
    { id: 2, from: "contact", text: "Grazie per il preventivo ricevuto!", time: "1h" },
  ],
  4: [
    { id: 1, from: "contact", text: "Posso fissare un appuntamento per la prossima settimana?", time: "2h" },
    { id: 2, from: "user", text: "Certo Sofia, che giorno preferisce?", time: "2h" },
  ],
  5: [
    { id: 1, from: "user", text: "Le confermo l'appuntamento di domani alle 9:00.", time: "3h" },
    { id: 2, from: "contact", text: "Conferma appuntamento domani alle 9", time: "3h" },
  ],
};
