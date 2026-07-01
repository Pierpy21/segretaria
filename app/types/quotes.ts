export type QuoteStatus = "pending_ai" | "quote_sent" | "approved" | "declined";

export interface Quote {
  id: string;
  client: string;
  type: string;
  date: string;
  status: QuoteStatus;
  amount: string;
  description: string;
  isAiGenerated: boolean;
}

export interface StatusMeta {
  label: string;
  bg: string;
  text: string;
  icon: React.ElementType;
}
