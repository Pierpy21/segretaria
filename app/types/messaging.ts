export interface ChatListItem {
  id: number;
  name: string;
  snippet: string;
  time: string;
  unread: number;
  ai: boolean;
  initials: string;
  color: string;
}

export type MessageFrom = "contact" | "user" | "ai-draft";

export interface Message {
  id: number;
  from: MessageFrom;
  text: string;
  time: string;
}
