"use client";

import { CheckCircle2, Clock3, FileText, Wallet } from "lucide-react";
import KpiCards from "@/app/components/kpi-cards";
import QuotesTable from "@/app/components/quotas-table";
import { Skeleton, ErrorState } from "@/app/components/ui/async-state";
import { STATUS_META } from "@/app/constants/quotes";
import { useApiData } from "@/app/hooks/use-api-data";
import { formatEuro, parseAmount } from "@/app/lib/amount";
import type { Quote } from "@/app/types/quotes";

const sumOf = (list: Quote[]) => list.reduce((sum, q) => sum + (parseAmount(q.amount) ?? 0), 0);

/** Riepilogo economico per il contabile: KPI sui preventivi e ultimi piani di cura. */
export default function AccountantSummaryPage() {
  const quotesHook = useApiData<Quote[]>("/api/quotes");

  if (quotesHook.loading) return <Skeleton className="h-72" />;
  if (quotesHook.error) return <ErrorState message="Impossibile caricare il riepilogo." onRetry={quotesHook.reload} />;

  const quotes = quotesHook.data ?? [];
  const approved = quotes.filter(q => q.status === "approved");
  const awaiting = quotes.filter(q => q.status === "quote_sent");
  const pendingAi = quotes.filter(q => q.status === "pending_ai");

  const kpis = [
    {
      label: "Preventivi accettati",
      value: String(approved.length),
      sub: `${formatEuro(sumOf(approved))} accettati`,
      up: true,
      icon: CheckCircle2,
      accent: "#4b2d20",
      spark: [approved.length],
    },
    {
      label: "In attesa di accettazione",
      value: String(awaiting.length),
      sub: `${formatEuro(sumOf(awaiting))} da incassare`,
      up: true,
      icon: Clock3,
      accent: "#8c5a3c",
      spark: [awaiting.length],
    },
    {
      label: "Bozze AI da verificare",
      value: String(pendingAi.length),
      sub: pendingAi.length === 0 ? "Nessuna in attesa" : "Da approvare prima dell'invio",
      up: pendingAi.length === 0,
      icon: FileText,
      accent: "#f59e0b",
      spark: [pendingAi.length],
    },
    {
      label: "Valore totale preventivi",
      value: formatEuro(sumOf(quotes)),
      sub: `${quotes.length} piani di cura`,
      up: true,
      icon: Wallet,
      accent: "#da528a",
      spark: [quotes.length],
    },
  ];

  const statusMap = Object.fromEntries(
    Object.entries(STATUS_META).map(([key, val]) => [key, { label: val.label, bg: val.bg, text: val.text }])
  );

  return (
    <>
      <KpiCards data={kpis} />
      <QuotesTable data={quotes.slice(0, 10)} statusMap={statusMap} />
    </>
  );
}
