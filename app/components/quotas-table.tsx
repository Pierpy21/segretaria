"use client";

import { Filter, Eye, Pencil } from "lucide-react";
import { useTerms } from "@/app/hooks/use-terms";

// Interfaccia per il singolo elemento della tabella
interface QuoteItem {
  id: string;
  client: string;
  type: string;
  date: string;
  status: string;
  amount: string;
}

// Interfaccia per le Props del componente
interface QuotesTableProps {
  data: QuoteItem[];
  statusMap: Record<string, { label: string; bg: string; text: string }>;
  onView?: (item: QuoteItem) => void; // Funzione per il tasto "Preview"
  onEdit?: (item: QuoteItem) => void; // Funzione per il tasto "Edit"
}

export default function QuotesTable({ data, statusMap, onView, onEdit }: QuotesTableProps) {
  const terms = useTerms();
  return (
    <div className="bg-surface rounded-2xl overflow-hidden flex flex-col border border-line">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink">{terms.quotePlural}</h2>
          <p className="text-xs text-ink-muted">{data.length} {terms.quotePlural.toLowerCase()} attivi</p>
        </div>
        <button className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-surface-muted border border-line text-ink hover:bg-line transition-colors">
          <Filter size={11} /> Filtra
        </button>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-muted">
              {[terms.clientSingular, "Prestazione", "Data", "Importo", "Stato", ""].map(h => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left font-bold text-ink-muted border-b border-line"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.map((q, idx) => {
              const s = statusMap[q.status] || { label: q.status, bg: "#f5efe2", text: "#4b2d20" };
              return (
                <tr
                  key={q.id}
                  className={`transition-colors hover:bg-surface-muted
                    ${idx < data.length - 1 ? "border-b border-line" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{q.client}</div>
                    <div className="text-[10px] mt-0.5 text-ink-muted">{q.id}</div>
                  </td>
                  <td className="px-4 py-3 text-ink">{q.type}</td>
                  <td className="px-4 py-3 text-ink-muted">{q.date}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{q.amount}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap [background-color:var(--status-bg)] [color:var(--status-txt)]"
                      style={{
                        ["--status-bg" as string]: s.bg,
                        ["--status-txt" as string]: s.text
                      }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {/* Pulsante di View (Occhio) */}
                      <button
                        onClick={() => onView?.(q)}
                        className="p-1.5 rounded-lg text-ink-muted hover:bg-line transition-colors"
                        title="Preview"
                      >
                        <Eye size={12} />
                      </button>

                      {/* Pulsante di Edit (Matita) */}
                      <button
                        onClick={() => onEdit?.(q)}
                        className="p-1.5 rounded-lg text-ink-muted hover:bg-line transition-colors"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
