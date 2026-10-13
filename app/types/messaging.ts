export interface ChatListItem {
  id: string;
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
  id: string;
  from: MessageFrom;
  text: string;
  time: string;
}
