"use client";

import { useState } from "react";
import { Bot, Search, Send, Check, X, Sparkles } from "lucide-react";

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

export interface Message {
  id: number;
  from: "contact" | "user" | "ai-draft";
  text: string;
  time: string;
}

interface MessagingPageProps {
  chats: ChatListItem[];
  conversations: Record<number, Message[]>;
}

export default function MessagingPage({ chats, conversations }: MessagingPageProps) {
  const [tab, setTab] = useState<"All" | "Unread" | "AI Active">("All");
  const [selectedId, setSelectedId] = useState<number | null>(chats[0]?.id ?? null);
  const [threads, setThreads] = useState(conversations);
  const [draftText, setDraftText] = useState<string | null>(null);

  const filteredChats =
    tab === "Unread" ? chats.filter(c => c.unread > 0)
    : tab === "AI Active" ? chats.filter(c => c.ai)
    : chats;

  const selectedChat = chats.find(c => c.id === selectedId) ?? null;
  const messages = selectedId != null ? threads[selectedId] ?? [] : [];
  const pendingDraft = messages.find(m => m.from === "ai-draft") ?? null;

  function updateThread(chatId: number, next: Message[]) {
    setThreads(prev => ({ ...prev, [chatId]: next }));
  }

  function approveDraft() {
    if (selectedId == null || !pendingDraft) return;
    const text = draftText ?? pendingDraft.text;
    updateThread(
      selectedId,
      messages.map(m => (m.id === pendingDraft.id ? { ...m, from: "user", text } : m))
    );
    setDraftText(null);
  }

  function discardDraft() {
    if (selectedId == null || !pendingDraft) return;
    updateThread(selectedId, messages.filter(m => m.id !== pendingDraft.id));
    setDraftText(null);
  }

  function selectChat(id: number) {
    setSelectedId(id);
    setDraftText(null);
  }

  return (
    <div className="grid grid-cols-[320px_1fr] gap-4 h-[calc(100vh-190px)]">
      {/* Chat list */}
      <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
        <div className="px-4 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Chats</h2>
          <p className="text-xs text-slate-500 mb-3">Evolution API — WhatsApp</p>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 focus-within:border-blue-500 transition-colors">
            <Search size={13} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              className="bg-transparent outline-none flex-1 text-xs text-slate-900 placeholder-slate-400"
              placeholder="Cerca contatto…"
            />
          </div>
        </div>

        <div className="flex gap-1.5 px-4 pt-3 pb-2">
          {(["All", "Unread", "AI Active"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors
                ${tab === t
                  ? "bg-blue-600 text-white"
                  : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {filteredChats.map(chat => {
            const active = chat.id === selectedId;
            const hasDraft = (threads[chat.id] ?? []).some(m => m.from === "ai-draft");
            return (
              <button
                key={chat.id}
                onClick={() => selectChat(chat.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                  ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}
              >
                <div
                  className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white [background-color:var(--avatar-color)]"
                  style={{ ["--avatar-color" as any]: chat.color }}
                >
                  {chat.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-semibold text-slate-900 truncate">{chat.name}</span>
                    {chat.ai && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                        <Bot size={8} /> AI
                      </span>
                    )}
                  </div>
                  <p className="text-xs truncate text-slate-400">{chat.snippet}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="text-[11px] text-slate-400">{chat.time}</span>
                  {hasDraft && (
                    <span className="w-2 h-2 rounded-full bg-amber-400" title="Bozza AI in attesa" />
                  )}
                  {chat.unread > 0 && (
                    <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center bg-blue-600">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation */}
      <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
        {selectedChat ? (
          <>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <div
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white [background-color:var(--avatar-color)]"
                style={{ ["--avatar-color" as any]: selectedChat.color }}
              >
                {selectedChat.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{selectedChat.name}</p>
                <p className="text-xs text-slate-400">WhatsApp</p>
              </div>
              {selectedChat.ai && (
                <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> AI Agent Active
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.filter(m => m.from !== "ai-draft").map(m => (
                <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm
                      ${m.from === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}
                  >
                    <p>{m.text}</p>
                    <p className={`text-[10px] mt-1 ${m.from === "user" ? "text-blue-100" : "text-slate-400"}`}>
                      {m.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* AI draft preview — waits for user approval before sending */}
            {pendingDraft && (
              <div className="mx-5 mb-4 rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-4 flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-blue-700">
                  <Sparkles size={12} /> Bozza generata dall&apos;agente AI (n8n) — richiede approvazione
                </div>
                <textarea
                  value={draftText ?? pendingDraft.text}
                  onChange={e => setDraftText(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none"
                />
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button
                    onClick={discardDraft}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <X size={13} /> Scarta
                  </button>
                  <button
                    onClick={approveDraft}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    <Check size={13} /> Approva & Invia
                  </button>
                </div>
              </div>
            )}

            {/* Manual reply */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 flex-shrink-0">
              <input
                type="text"
                placeholder="Scrivi un messaggio…"
                className="flex-1 rounded-xl px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 transition-colors"
              />
              <button className="p-2.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors flex-shrink-0">
                <Send size={15} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Seleziona una chat
          </div>
        )}
      </div>
    </div>
  );
}
