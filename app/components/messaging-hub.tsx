"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { useTerms } from "@/app/hooks/use-terms";
import type { ChatListItem } from "@/app/types/messaging";

interface MessagingHubProps {
  chats: ChatListItem[];
}

export default function MessagingHub({ chats }: MessagingHubProps) {
  const terms = useTerms();
  const [chatTab, setChatTab] = useState<"Tutte" | "Non lette" | "AI Attiva">("Tutte");

  const filteredChats =
    chatTab === "Non lette" ? chats.filter(c => c.unread > 0)
    : chatTab === "AI Attiva" ? chats.filter(c => c.ai)
    : chats;

  return (
    <div className="bg-surface rounded-2xl overflow-hidden flex flex-col border border-line">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink">Centro Messaggi {terms.clientPlural}</h2>
          <p className="text-xs text-ink-muted">{terms.chatSubtitle}</p>
        </div>
        <button className="text-xs font-semibold text-accent-text hover:text-ink transition-colors">
          Vedi tutti →
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-5 pt-3 pb-1">
        {(["Tutte", "Non lette", "AI Attiva"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setChatTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center
              ${chatTab === tab
                ? "bg-accent text-accent-ink"
                : "bg-surface-muted text-ink-muted border border-line hover:bg-line"
              }`}
          >
            {tab}
            {tab === "Non lette" && chatTab !== "Non lette" && (
              <span className="ml-1.5 inline-block w-4 h-4 rounded-full text-accent-ink text-[9px] font-bold leading-4 text-center bg-accent">
                {chats.filter(c => c.unread > 0).length}
              </span>
            )}
          </button>
        ))}
      </div>


      {/* Chat List */}
      <div className="flex-1 divide-y divide-line">
        {filteredChats.map(chat => (
          <div
            key={chat.id}
            className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-surface-muted"
          >
            {/* Avatar dinamico con variabile CSS per il colore di sfondo */}
            <div
              className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white [background-color:var(--avatar-color)]"
              style={{ ["--avatar-color" as string]: chat.color }}
            >
              {chat.initials}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm font-semibold text-ink">{chat.name}</span>
                {chat.ai && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent-text">
                    <Bot size={8} /> AI
                  </span>
                )}
              </div>
              <p className="text-xs truncate text-ink-muted">{chat.snippet}</p>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[11px] text-ink-muted">{chat.time}</span>
              {chat.unread > 0 && (
                <span className="w-5 h-5 rounded-full text-accent-ink text-[10px] font-bold flex items-center justify-center bg-accent">
                  {chat.unread}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
