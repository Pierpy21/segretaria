"use client";

import { useState } from "react";
import { Bot, MessageSquare } from "lucide-react";

interface ChatMessage {
  id: number;
  name: string;
  snippet: string;
  time: string;
  unread: number;
  ai: boolean;
  initials: string;
  color: string;
}

interface MessagingHubProps {
  chats: ChatMessage[];
}

export default function MessagingHub({ chats }: MessagingHubProps) {
  const [chatTab, setChatTab] = useState<"All" | "Unread" | "AI Active">("All");

  const filteredChats =
    chatTab === "Unread" ? chats.filter(c => c.unread > 0)
    : chatTab === "AI Active" ? chats.filter(c => c.ai)
    : chats;

  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Messaging Hub</h2>
          <p className="text-xs text-slate-500">WhatsApp & Direct Messages</p>
        </div>
        <button className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors">
          View all →
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-5 pt-3 pb-1">
        {(["All", "Unread", "AI Active"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setChatTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center
              ${chatTab === tab 
                ? "bg-blue-600 text-white" 
                : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
              }`}
          >
            {tab}
            {tab === "Unread" && chatTab !== "Unread" && (
              <span className="ml-1.5 inline-block w-4 h-4 rounded-full text-white text-[9px] font-bold leading-4 text-center bg-blue-500">
                4
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chat List */}
      <div className="flex-1 divide-y divide-slate-50">
        {filteredChats.map(chat => (
          <div
            key={chat.id}
            className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-slate-50"
          >
            {/* Avatar dinamico con variabile CSS per il colore di sfondo */}
            <div
              className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white [background-color:var(--avatar-color)]"
              style={{ ["--avatar-color" as any]: chat.color }}
            >
              {chat.initials}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm font-semibold text-slate-900">{chat.name}</span>
                {chat.ai && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                    <Bot size={8} /> AI
                  </span>
                )}
              </div>
              <p className="text-xs truncate text-slate-400">{chat.snippet}</p>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[11px] text-slate-400">{chat.time}</span>
              {chat.unread > 0 && (
                <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center bg-blue-600">
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