"use client";

import { CheckCircle2, Clock3, FileText, Wallet } from "lucide-react";
import KpiCards from "@/app/components/kpi-cards";
import QuotesTable from "@/app/components/quotas-table";
import { Skeleton, ErrorState } from "@/app/components/ui/async-state";
import { quoteStatusMap } from "@/app/constants/quotes";
import { useApiData } from "@/app/hooks/use-api-data";
import { useTerms } from "@/app/hooks/use-terms";
import { formatEuro, parseAmount } from "@/app/lib/amount";
import type { Quote } from "@/app/types/quotes";

const sumOf = (list: Quote[]) => list.reduce((sum, q) => sum + (parseAmount(q.amount) ?? 0), 0);

/** Riepilogo economico per il contabile: KPI sui preventivi e ultimi preventivi. */
export default function AccountantSummaryPage() {
  const quotesHook = useApiData<Quote[]>("/api/quotes");
  const terms = useTerms();
  const quotePlural = terms.quotePlural;

  if (quotesHook.loading) return <Skeleton className="h-72" />;
  if (quotesHook.error) return <ErrorState message="Impossibile caricare il riepilogo." onRetry={quotesHook.reload} />;

  const quotes = quotesHook.data ?? [];
  const approved = quotes.filter(q => q.status === "approved");
  const awaiting = quotes.filter(q => q.status === "quote_sent");
  const pendingAi = quotes.filter(q => q.status === "pending_ai");

  const kpis = [
    {
      label: `${quotePlural} accettati`,
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
      label: `Valore totale ${quotePlural.toLowerCase()}`,
      value: formatEuro(sumOf(quotes)),
      sub: `${quotes.length} ${quotePlural.toLowerCase()}`,
      up: true,
      icon: Wallet,
      accent: "#da528a",
      spark: [quotes.length],
    },
  ];

  const statusMap = quoteStatusMap(terms);

  return (
    <>
      <KpiCards data={kpis} />
      <QuotesTable data={quotes.slice(0, 10)} statusMap={statusMap} />
    </>
  );
}
