"use client";

import { useState } from "react";
import { Plus, X, Eye, Check, XCircle, Download, Send, Bot, FileText } from "lucide-react";

type QuoteStatus = "pending_ai" | "quote_sent" | "approved" | "declined";

interface Quote {
  id: string;
  client: string;
  type: string;
  date: string;
  status: QuoteStatus;
  amount: string;
  description: string;
  isAiGenerated: boolean;
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const INITIAL_QUOTES: Quote[] = [
  { id: "Q-001", client: "Anna Bianchi", type: "Plumber", date: "Jul 1, 2026", status: "pending_ai", amount: "€280", description: "Emergency pipe repair, bathroom sink.", isAiGenerated: true },
  { id: "Q-002", client: "Roberto Conti", type: "Electrician", date: "Jun 30, 2026", status: "quote_sent", amount: "€450", description: "Electrical rewiring, 3rd floor apartment, Via Roma 14.", isAiGenerated: false },
  { id: "Q-003", client: "Maria Greco", type: "Carpenter", date: "Jun 29, 2026", status: "approved", amount: "€1,200", description: "Custom shelving unit, oak wood, living room.", isAiGenerated: false },
  { id: "Q-004", client: "Paolo Mancini", type: "Plumber", date: "Jun 28, 2026", status: "pending_ai", amount: "€160", description: "Faucet replacement, kitchen sink, quick job.", isAiGenerated: true },
  { id: "Q-005", client: "Elena Vitali", type: "Painter", date: "Jun 27, 2026", status: "quote_sent", amount: "€820", description: "Interior wall painting, 2 bedrooms, matte finish.", isAiGenerated: false },
  { id: "Q-006", client: "Francesca Rossi", type: "Plumber", date: "Jun 26, 2026", status: "pending_ai", amount: "€520", description: "Hot water tank installation and setup.", isAiGenerated: true },
  { id: "Q-007", client: "Giancarlo Bianchi", type: "Carpenter", date: "Jun 25, 2026", status: "approved", amount: "€2,100", description: "Kitchen cabinet design and installation, custom hardware.", isAiGenerated: false },
];

const STATUS_META: Record<QuoteStatus, { label: string; bg: string; text: string; icon: typeof Check }> = {
  pending_ai: { label: "Pending AI Review", bg: "#fef9c3", text: "#854d0e", icon: FileText },
  quote_sent: { label: "Quote Sent", bg: "#dbeafe", text: "#1e40af", icon: Send },
  approved: { label: "Approved", bg: "#dcfce7", text: "#166534", icon: Check },
  declined: { label: "Declined", bg: "#fee2e2", text: "#991b1b", icon: XCircle },
};

let nextQuoteId = INITIAL_QUOTES.length + 1;

// ─── Component ──────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>(INITIAL_QUOTES);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [form, setForm] = useState({ client: "", type: "", amount: "", description: "" });

  const filtered = statusFilter === "all" ? quotes : quotes.filter(q => q.status === statusFilter);

  function updateQuoteStatus(id: string, newStatus: QuoteStatus) {
    setQuotes(prev => prev.map(q => (q.id === id ? { ...q, status: newStatus } : q)));
    setSelectedQuote(prev => (prev && prev.id === id ? { ...prev, status: newStatus } : prev));
  }

  function approveAi(id: string) {
    updateQuoteStatus(id, "quote_sent");
  }

  function declineAi(id: string) {
    updateQuoteStatus(id, "declined");
  }

  function submitNewQuote() {
    if (!form.client.trim() || !form.type.trim() || !form.amount.trim()) return;
    const newQuote: Quote = {
      id: `Q-${String(nextQuoteId++).padStart(3, "0")}`,
      client: form.client.trim(),
      type: form.type.trim(),
      date: new Date().toLocaleDateString("it-IT", { year: "numeric", month: "short", day: "numeric" }),
      status: "pending_ai",
      amount: form.amount.trim().startsWith("€") ? form.amount.trim() : `€${form.amount.trim()}`,
      description: form.description.trim() || "Nessuna descrizione fornita.",
      isAiGenerated: false,
    };
    setQuotes(prev => [newQuote, ...prev]);
    setForm({ client: "", type: "", amount: "", description: "" });
    setShowNewModal(false);
  }

  const statusCounts = {
    all: quotes.length,
    pending_ai: quotes.filter(q => q.status === "pending_ai").length,
    quote_sent: quotes.filter(q => q.status === "quote_sent").length,
    approved: quotes.filter(q => q.status === "approved").length,
    declined: quotes.filter(q => q.status === "declined").length,
  };

  return (
    <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
      {/* ── Main column ── */}
      <div className="space-y-4 min-w-0">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Quotes & Requests</h2>
              <p className="text-xs text-slate-500">Manage client quotes and service requests</p>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <Plus size={13} /> New Quote
            </button>
          </div>

          {/* Status filters */}
          <div className="flex flex-wrap gap-2">
            {(["all", "pending_ai", "quote_sent", "approved", "declined"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${statusFilter === s
                    ? "bg-blue-600 text-white"
                    : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
              >
                {s === "all" ? "All" : STATUS_META[s].label}
                <span className="ml-1.5 font-bold">{statusCounts[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quotes list */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <p className="text-sm text-slate-400">Nessun preventivo per questo filtro.</p>
            </div>
          ) : (
            filtered.map(quote => {
              const meta = STATUS_META[quote.status];
              const Icon = meta.icon;
              return (
                <button
                  key={quote.id}
                  onClick={() => setSelectedQuote(quote)}
                  className={`w-full bg-white rounded-2xl border transition-colors text-left
                    ${selectedQuote?.id === quote.id ? "border-blue-400 bg-blue-50/40" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="p-4 flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: meta.bg, color: meta.text }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-semibold text-slate-900">{quote.client}</p>
                        {quote.isAiGenerated && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <Bot size={8} /> AI
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs text-slate-500">{quote.type}</p>
                        <span className="text-xs font-semibold" style={{ color: meta.text }}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{quote.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900">{quote.amount}</p>
                      <p className="text-[10px] text-slate-400">{quote.date}</p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      {selectedQuote && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sticky top-[100px]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900">Quote Details</p>
            <button onClick={() => setSelectedQuote(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Quote ID</p>
              <p className="text-sm font-semibold text-slate-900">{selectedQuote.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Client</p>
              <p className="text-sm text-slate-700">{selectedQuote.client}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Service Type</p>
              <p className="text-sm text-slate-700">{selectedQuote.type}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Amount</p>
              <p className="text-lg font-bold text-slate-900">{selectedQuote.amount}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Date Created</p>
              <p className="text-sm text-slate-700">{selectedQuote.date}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Status</p>
              <div
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: STATUS_META[selectedQuote.status].bg, color: STATUS_META[selectedQuote.status].text }}
              >
                {STATUS_META[selectedQuote.status].label}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Description</p>
              <p className="text-xs text-slate-600 leading-snug">{selectedQuote.description}</p>
            </div>

            {selectedQuote.isAiGenerated && selectedQuote.status === "pending_ai" && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-700 mb-2">Generated by AI Agent</p>
                <p className="text-xs text-emerald-600 leading-snug mb-3">
                  This quote was automatically created by the AI secretary based on client inquiry. Review and either approve to send or decline to regenerate.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => declineAi(selectedQuote.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50"
                  >
                    <XCircle size={12} /> Regenerate
                  </button>
                  <button
                    onClick={() => approveAi(selectedQuote.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check size={12} /> Approve & Send
                  </button>
                </div>
              </div>
            )}

            {selectedQuote.status === "quote_sent" && (
              <button className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200">
                <Download size={12} /> Download PDF
              </button>
            )}

            {selectedQuote.status === "approved" && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-700">✓ Approved</p>
                <p className="text-[10px] text-emerald-600 mt-1">This quote has been approved by the client. Ready for invoicing.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── New quote modal ── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Create New Quote</p>
              <button onClick={() => setShowNewModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2.5">
              <input
                value={form.client}
                onChange={e => setForm({ ...form, client: e.target.value })}
                placeholder="Client name"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <input
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                placeholder="Service type (e.g., Plumbing)"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <input
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="Amount (e.g., 250 or €250)"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Quote description (optional)"
                rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitNewQuote}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
              >
                Create Quote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
