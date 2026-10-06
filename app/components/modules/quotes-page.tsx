"use client";

import { useState } from "react";
import { Plus, X, Check, XCircle, Download } from "lucide-react";
import QuotesTable from "@/app/components/quotas-table";
import { Quote, QuoteStatus } from "@/app/types/quotes";
import { STATUS_META } from "@/app/constants/quotes";
import { INITIAL_QUOTES } from "@/app/data/quotes";

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
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
      {/* ── Main column ── */}
      <div className="space-y-4 min-w-0">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Piani di Cura & Preventivi</h2>
              <p className="text-xs text-slate-500">Gestione trattamenti clinici, preventivi odontoiatrici e accettazioni</p>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <Plus size={13} /> Nuovo Piano di Cura
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
                {s === "all" ? "Tutti" : STATUS_META[s].label}
                <span className="ml-1.5 font-bold">{statusCounts[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quotes table */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-400">Nessun piano di cura per questo filtro.</p>
          </div>
        ) : (
          <QuotesTable
            data={filtered as any}
            statusMap={Object.fromEntries(
              Object.entries(STATUS_META).map(([key, val]) => [key, { label: val.label, bg: val.bg, text: val.text }])
            )}
            onView={(item) => setSelectedQuote(item as Quote)} 
            onEdit={(item) => {
              const quote = item as Quote;
              setForm({ 
                client: quote.client, 
                type: quote.type, 
                amount: quote.amount.replace("€", ""),
                description: quote.description 
              });
              setShowNewModal(true);
            }}
          />
        )}
      </div>

      {/* ── Sidebar ── */}
      {selectedQuote && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sticky top-[100px]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900">Dettaglio Piano di Cura</p>
            <button onClick={() => setSelectedQuote(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Codice PDC</p>
              <p className="text-sm font-semibold text-slate-900">{selectedQuote.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Paziente</p>
              <p className="text-sm text-slate-700">{selectedQuote.client}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Prestazione / Branca</p>
              <p className="text-sm text-slate-700">{selectedQuote.type}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Preventivo Economico</p>
              <p className="text-lg font-bold text-slate-900">{selectedQuote.amount}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Data Elaborazione</p>
              <p className="text-sm text-slate-700">{selectedQuote.date}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Stato Accettazione</p>
              <div
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: STATUS_META[selectedQuote.status].bg, color: STATUS_META[selectedQuote.status].text }}
              >
                {STATUS_META[selectedQuote.status].label}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Dettagli Clinici</p>
              <p className="text-xs text-slate-600 leading-snug">{selectedQuote.description}</p>
            </div>

            {selectedQuote.isAiGenerated && selectedQuote.status === "pending_ai" && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-700 mb-2">Bozza Generata da AI Clinica</p>
                <p className="text-xs text-emerald-600 leading-snug mb-3">
                  Piano di trattamento precompilato dall&apos;assistente AI in base alla richiesta del paziente. Verifica le prestazioni e approva l&apos;invio telematico.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => declineAi(selectedQuote.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50"
                  >
                    <XCircle size={12} /> Ricalcola
                  </button>
                  <button
                    onClick={() => approveAi(selectedQuote.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check size={12} /> Approva & Invia
                  </button>
                </div>
              </div>
            )}

            {selectedQuote.status === "quote_sent" && (
              <button className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200">
                <Download size={12} /> Scarica PDF Preventivo
              </button>
            )}

            {selectedQuote.status === "approved" && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-700">✓ Accettato dal Paziente</p>
                <p className="text-[10px] text-emerald-600 mt-1">Piano di cura accettato con firma digitale. Pronto per la fatturazione o acconto.</p>
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
              <p className="text-sm font-semibold text-slate-900">Nuovo Piano di Cura</p>
              <button onClick={() => setShowNewModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2.5">
              <input
                value={form.client}
                onChange={e => setForm({ ...form, client: e.target.value })}
                placeholder="Nome e cognome paziente"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <input
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                placeholder="Prestazione (es. Implantologia, Ortodonzia, Igiene)"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <input
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="Importo preventivo (es. 1450 o €1.450)"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Dettagli terapeutici, elementi dentali e note cliniche"
                rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                onClick={submitNewQuote}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
              >
                Salva Piano di Cura
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
