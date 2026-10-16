"use client";

import { useState, type FormEvent } from "react";
import { Plus, X, Check, XCircle, Download, Trash2, LoaderCircle } from "lucide-react";
import QuotesTable from "@/app/components/quotas-table";
import { STATUS_META } from "@/app/constants/quotes";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { useMe } from "@/app/hooks/use-me";
import { refreshBadges } from "@/app/hooks/use-sidebar-badges";
import { hasPermission } from "@/lib/auth/permissions";
import { Skeleton, ErrorState } from "@/app/components/ui/async-state";
import { parseAmount } from "@/app/lib/amount";
import type { Quote, QuoteStatus } from "@/app/types/quotes";
import type { CreateQuoteInput } from "@/app/types/api";

interface QuoteForm {
  client: string;
  type: string;
  amount: string;
  description: string;
}

type QuoteModal = { mode: "create" } | { mode: "edit"; id: string };

const EMPTY_FORM: QuoteForm = { client: "", type: "", amount: "", description: "" };

const STATUS_STATES = ["all", "pending_ai", "quote_sent", "approved", "declined"] as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const quotesHook = useApiData<Quote[]>("/api/quotes");
  const quotes = quotesHook.data ?? [];
  const { data: me } = useMe();
  const canClinical = hasPermission(me?.role, "clinical:read");

  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<QuoteModal | null>(null);
  const [form, setForm] = useState<QuoteForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedQuote = quotes.find(q => q.id === selectedId) ?? null;
  const filtered = statusFilter === "all" ? quotes : quotes.filter(q => q.status === statusFilter);

  // Aggiornamento stato ottimistico con rollback
  async function updateStatus(q: Quote, status: QuoteStatus) {
    setActionError(null);
    quotesHook.mutate(list => (list ?? []).map(x => (x.id === q.id ? { ...x, status } : x)));
    try {
      const updated = await apiFetch<Quote>(`/api/quotes/${encodeURIComponent(q.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      quotesHook.mutate(list => (list ?? []).map(x => (x.id === q.id ? updated : x)));
      refreshBadges();
    } catch (err) {
      quotesHook.mutate(list => (list ?? []).map(x => (x.id === q.id ? { ...x, status: q.status } : x)));
      setActionError(errorMessage(err));
    }
  }

  async function deleteQuote(q: Quote) {
    if (!window.confirm(`Eliminare il piano di cura di ${q.client}?`)) return;
    setActionError(null);
    setSelectedId(null);
    quotesHook.mutate(list => (list ?? []).filter(x => x.id !== q.id));
    try {
      await apiFetch<null>(`/api/quotes/${encodeURIComponent(q.id)}`, { method: "DELETE" });
      refreshBadges();
    } catch (err) {
      quotesHook.mutate(list => [q, ...(list ?? [])]);
      setActionError(errorMessage(err));
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModal({ mode: "create" });
  }

  function openEdit(q: Quote) {
    const amount = parseAmount(q.amount);
    setForm({
      client: q.client,
      type: q.type,
      amount: amount === null ? "" : String(amount),
      description: q.description,
    });
    setFormError(null);
    setModal({ mode: "edit", id: q.id });
  }

  function closeModal() {
    setModal(null);
    setFormError(null);
  }

  async function submitQuote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const client = form.client.trim();
    const type = form.type.trim();
    const amount = parseAmount(form.amount);
    if (!client || !type || amount === null) {
      setFormError("Compila paziente, prestazione e un importo valido.");
      return;
    }
    const payload: CreateQuoteInput = {
      client,
      type,
      amount,
      description: form.description.trim() || undefined,
    };
    setFormError(null);
    setSubmitting(true);
    try {
      if (modal && modal.mode === "edit") {
        const updated = await apiFetch<Quote>(`/api/quotes/${encodeURIComponent(modal.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        quotesHook.mutate(list => (list ?? []).map(x => (x.id === updated.id ? updated : x)));
      } else {
        const created = await apiFetch<Quote>("/api/quotes", { method: "POST", body: JSON.stringify(payload) });
        quotesHook.mutate(list => [created, ...(list ?? [])]);
      }
      refreshBadges();
      closeModal();
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const statusCounts: Record<(typeof STATUS_STATES)[number], number> = {
    all: quotes.length,
    pending_ai: quotes.filter(q => q.status === "pending_ai").length,
    quote_sent: quotes.filter(q => q.status === "quote_sent").length,
    approved: quotes.filter(q => q.status === "approved").length,
    declined: quotes.filter(q => q.status === "declined").length,
  };

  const statusMap = Object.fromEntries(
    Object.entries(STATUS_META).map(([key, val]) => [key, { label: val.label, bg: val.bg, text: val.text }])
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
      {/* ── Main column ── */}
      <div className="space-y-4 min-w-0">
        {/* Header */}
        <div className="bg-surface rounded-2xl border border-line p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Piani di Cura & Preventivi</h2>
              <p className="text-xs text-ink-muted">Gestione trattamenti clinici, preventivi odontoiatrici e accettazioni</p>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-ink bg-accent hover:bg-accent-hover transition-colors"
            >
              <Plus size={13} /> Nuovo Piano di Cura
            </button>
          </div>

          {/* Status filters */}
          <div className="flex flex-wrap gap-2">
            {STATUS_STATES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${statusFilter === s
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-muted text-ink-muted border border-line hover:bg-line"
                  }`}
              >
                {s === "all" ? "Tutti" : STATUS_META[s].label}
                <span className="ml-1.5 font-bold">{statusCounts[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {actionError && <ErrorState message={actionError} />}

        {/* Quotes table */}
        {quotesHook.loading ? (
          <Skeleton className="h-72" />
        ) : quotesHook.error ? (
          <ErrorState message="Impossibile caricare i preventivi." onRetry={quotesHook.reload} />
        ) : filtered.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-8 text-center">
            <p className="text-sm text-ink-muted">
              {quotes.length === 0 ? "Nessun piano di cura registrato." : "Nessun piano di cura per questo filtro."}
            </p>
            {quotes.length === 0 && (
              <button
                onClick={openCreate}
                className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-ink bg-accent hover:bg-accent-hover"
              >
                Crea il primo piano di cura
              </button>
            )}
          </div>
        ) : (
          <QuotesTable
            data={filtered}
            statusMap={statusMap}
            onView={item => setSelectedId(item.id)}
            onEdit={item => {
              const q = quotes.find(x => x.id === item.id);
              if (q) openEdit(q);
            }}
          />
        )}
      </div>

      {/* ── Sidebar ── */}
      {selectedQuote && (
        <div className="bg-surface rounded-2xl border border-line p-4 sticky top-[100px]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink">Dettaglio Piano di Cura</p>
            <button onClick={() => setSelectedId(null)} className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Chiudi dettaglio">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Codice PDC</p>
              <p className="text-sm font-semibold text-ink">{selectedQuote.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Paziente</p>
              <p className="text-sm text-ink">{selectedQuote.client}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Prestazione / Branca</p>
              <p className="text-sm text-ink">{selectedQuote.type}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Preventivo Economico</p>
              <p className="text-lg font-bold text-ink">{selectedQuote.amount}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Data Elaborazione</p>
              <p className="text-sm text-ink">{selectedQuote.date}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Stato Accettazione</p>
              <div
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: STATUS_META[selectedQuote.status].bg, color: STATUS_META[selectedQuote.status].text }}
              >
                {STATUS_META[selectedQuote.status].label}
              </div>
            </div>
            {canClinical && (
              <div>
                <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Dettagli Clinici</p>
                <p className="text-xs text-ink-muted leading-snug">{selectedQuote.description}</p>
              </div>
            )}

            {selectedQuote.isAiGenerated && selectedQuote.status === "pending_ai" && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-800 mb-2">Bozza Generata da AI Clinica</p>
                <p className="text-xs text-emerald-800 leading-snug mb-3">
                  Piano di trattamento precompilato dall&apos;assistente AI in base alla richiesta del paziente. Verifica le prestazioni e approva l&apos;invio telematico.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void updateStatus(selectedQuote, "declined")}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-surface border border-emerald-200 hover:bg-emerald-50"
                  >
                    <XCircle size={12} /> Ricalcola
                  </button>
                  <button
                    onClick={() => void updateStatus(selectedQuote, "quote_sent")}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800"
                  >
                    <Check size={12} /> Approva & Invia
                  </button>
                </div>
              </div>
            )}

            {selectedQuote.status === "quote_sent" && (
              <button className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-ink bg-surface-muted hover:bg-line">
                <Download size={12} /> Scarica PDF Preventivo
              </button>
            )}

            {selectedQuote.status === "approved" && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-800">✓ Accettato dal Paziente</p>
                <p className="text-[10px] text-emerald-800 mt-1">Piano di cura accettato con firma digitale. Pronto per la fatturazione o acconto.</p>
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t border-line">
              <button
                onClick={() => openEdit(selectedQuote)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-ink bg-surface border border-line hover:bg-surface-muted"
              >
                Modifica
              </button>
              <button
                onClick={() => void deleteQuote(selectedQuote)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-red-800 bg-red-50 border border-red-200 hover:bg-red-100"
              >
                <Trash2 size={12} /> Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / edit modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-sidebar/40 flex items-center justify-center p-4">
          <form onSubmit={submitQuote} className="bg-surface rounded-2xl border border-line w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink">
                {modal.mode === "edit" ? "Modifica Piano di Cura" : "Nuovo Piano di Cura"}
              </p>
              <button type="button" onClick={closeModal} className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Chiudi">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2.5">
              <input
                value={form.client}
                onChange={e => setForm({ ...form, client: e.target.value })}
                placeholder="Nome e cognome paziente"
                className="w-full rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent"
              />
              <input
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                placeholder="Prestazione (es. Implantologia, Ortodonzia, Igiene)"
                className="w-full rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent"
              />
              <input
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                inputMode="decimal"
                placeholder="Importo preventivo (es. 1450 o €1.450)"
                className="w-full rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent"
              />
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Dettagli terapeutici, elementi dentali e note cliniche"
                rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent resize-none"
              />
            </div>
            {formError && <p className="mt-3 text-xs font-semibold text-red-800">{formError}</p>}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={closeModal}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-muted bg-surface border border-line hover:bg-surface-muted"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-ink bg-accent hover:bg-accent-hover disabled:opacity-60"
              >
                {submitting && <LoaderCircle size={12} className="animate-spin" />}
                Salva Piano di Cura
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
