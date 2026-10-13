"use client";

import { useState, type FormEvent } from "react";
import { Bot, Search, Send, Check, X, Sparkles, ArrowLeft, LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { Skeleton, SkeletonRows, ErrorState } from "@/app/components/ui/async-state";
import type { ChatListItem, Message } from "@/app/types/messaging";
import type { CreateMessageInput } from "@/app/types/api";

type ChatTab = "Tutte" | "Non lette" | "AI Attiva";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MessagingPage() {
  const chatsHook = useApiData<ChatListItem[]>("/api/conversations");
  const chats = chatsHook.data ?? [];
  const { mutate: mutateChats } = chatsHook;

  const [tab, setTab] = useState<ChatTab>("Tutte");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const messagesHook = useApiData<Message[]>(
    selectedId ? `/api/conversations/${encodeURIComponent(selectedId)}/messages` : null
  );
  const messages = messagesHook.data ?? [];
  const { mutate: mutateMessages } = messagesHook;

  const selectedChat = chats.find(c => c.id === selectedId) ?? null;
  const pendingDraft = messages.find(m => m.from === "ai-draft") ?? null;

  const query = search.trim().toLowerCase();
  const filteredChats = chats.filter(c => {
    const byTab = tab === "Non lette" ? c.unread > 0 : tab === "AI Attiva" ? c.ai : true;
    const bySearch = !query || c.name.toLowerCase().includes(query);
    return byTab && bySearch;
  });

  function selectChat(chat: ChatListItem) {
    setSelectedId(chat.id);
    setDraftText(null);
    setActionError(null);
    setMobileChatOpen(true);
    if (chat.unread > 0) {
      mutateChats(list => (list ?? []).map(c => (c.id === chat.id ? { ...c, unread: 0 } : c)));
      // Non bloccante: il contatore si riallinea al prossimo caricamento
      apiFetch<null>(`/api/conversations/${encodeURIComponent(chat.id)}/read`, { method: "POST" }).catch(() => {
        /* ignorato */
      });
    }
  }

  async function sendMessage(text: string, draftId?: string) {
    if (!selectedId) return;
    const body: CreateMessageInput = { from: "user", text };
    setSending(true);
    setActionError(null);
    try {
      const created = await apiFetch<Message>(`/api/conversations/${encodeURIComponent(selectedId)}/messages`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      mutateMessages(list => [...(list ?? []).filter(m => m.id !== draftId), created]);
      mutateChats(list =>
        (list ?? []).map(c => (c.id === selectedId ? { ...c, snippet: created.text, time: created.time } : c))
      );
      setDraftText(null);
      if (!draftId) setReplyText("");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function approveDraft() {
    if (!pendingDraft) return;
    const text = (draftText ?? pendingDraft.text).trim();
    if (!text) return;
    void sendMessage(text, pendingDraft.id);
  }

  // Nessun endpoint per scartare la bozza: rimossa solo dalla vista corrente
  function discardDraft() {
    if (!pendingDraft) return;
    mutateMessages(list => (list ?? []).filter(m => m.id !== pendingDraft.id));
    setDraftText(null);
  }

  function handleReplySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || sending) return;
    void sendMessage(text);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-170px)] sm:h-[calc(100vh-190px)]">
      {/* Chat list */}
      <div className={`bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200 ${
        mobileChatOpen ? "hidden md:flex" : "flex"
      }`}>
        <div className="px-4 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Chat & Comunicazioni</h2>
          <p className="text-xs text-slate-500 mb-3">WhatsApp Studio — Evolution API</p>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 focus-within:border-blue-500 transition-colors">
            <Search size={13} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none flex-1 text-xs text-slate-900 placeholder-slate-400"
              placeholder="Cerca paziente…"
            />
          </div>
        </div>

        <div className="flex gap-1.5 px-4 pt-3 pb-2">
          {(["Tutte", "Non lette", "AI Attiva"] as const).map(t => (
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
          {chatsHook.loading ? (
            <div className="p-4">
              <SkeletonRows rows={5} className="h-14" />
            </div>
          ) : chatsHook.error ? (
            <div className="p-4">
              <ErrorState message="Impossibile caricare le chat." onRetry={chatsHook.reload} />
            </div>
          ) : filteredChats.length === 0 ? (
            <p className="px-4 py-6 text-xs text-center text-slate-400">Nessuna conversazione.</p>
          ) : (
            filteredChats.map(chat => {
              const active = chat.id === selectedId;
              return (
                <button
                  key={chat.id}
                  onClick={() => selectChat(chat)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                    ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white [background-color:var(--avatar-color)]"
                    style={{ ["--avatar-color" as string]: chat.color }}
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
                    {chat.unread > 0 && (
                      <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center bg-blue-600">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={`bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200 ${
        !mobileChatOpen ? "hidden md:flex" : "flex"
      }`}>
        {selectedChat ? (
          <>
            <div className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
              {/* Back button on mobile */}
              <button
                onClick={() => setMobileChatOpen(false)}
                className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 mr-1"
                aria-label="Torna alle chat"
              >
                <ArrowLeft size={16} />
              </button>

              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white [background-color:var(--avatar-color)]"
                style={{ ["--avatar-color" as string]: selectedChat.color }}
              >
                {selectedChat.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{selectedChat.name}</p>
                <p className="text-xs text-slate-400">WhatsApp</p>
              </div>
              {selectedChat.ai && (
                <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden sm:inline">Assistente</span> AI Attivo
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messagesHook.loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-2/3" />
                  <Skeleton className="h-12 w-1/2 ml-auto" />
                  <Skeleton className="h-12 w-3/5" />
                </div>
              ) : messagesHook.error ? (
                <ErrorState message="Impossibile caricare i messaggi." onRetry={messagesHook.reload} />
              ) : (
                messages.filter(m => m.from !== "ai-draft").map(m => (
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
                ))
              )}
            </div>

            {actionError && (
              <div className="mx-5 mb-2">
                <ErrorState message={actionError} />
              </div>
            )}

            {/* AI draft preview — waits for user approval before sending */}
            {pendingDraft && (
              <div className="mx-5 mb-4 rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-4 flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-blue-700">
                  <Sparkles size={12} /> Bozza generata dall&apos;AI Clinica — Triage e risposta (richiede approvazione)
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
                    disabled={sending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    <X size={13} /> Scarta
                  </button>
                  <button
                    onClick={approveDraft}
                    disabled={sending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {sending ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />} Approva & Invia
                  </button>
                </div>
              </div>
            )}

            {/* Manual reply */}
            <form onSubmit={handleReplySubmit} className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 flex-shrink-0">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Scrivi un messaggio…"
                aria-label="Scrivi un messaggio"
                className="flex-1 rounded-xl px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="submit"
                disabled={sending || !replyText.trim()}
                aria-label="Invia"
                className="p-2.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors flex-shrink-0 disabled:opacity-50"
              >
                {sending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </form>
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
