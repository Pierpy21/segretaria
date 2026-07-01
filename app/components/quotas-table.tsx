import { Filter, Eye, Pencil } from "lucide-react";

interface QuoteItem {
  id: string;
  client: string;
  type: string;
  date: string;
  status: string;
  amount: string;
}

interface QuotesTableProps {
  data: QuoteItem[];
  statusMap: Record<string, { label: string; bg: string; text: string }>;
}

export default function QuotesTable({ data, statusMap }: QuotesTableProps) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Quotes & Requests</h2>
          <p className="text-xs text-slate-500">{data.length} open requests total</p>
        </div>
        <button className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors">
          <Filter size={11} /> Filter
        </button>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50">
              {["Client", "Service", "Date", "Amount", "Status", ""].map(h => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left font-bold text-slate-400 border-b border-slate-100"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((q, idx) => {
              const s = statusMap[q.status] || { label: q.status, bg: "#f1f5f9", text: "#334155" };
              return (
                <tr
                  key={q.id}
                  className={`transition-colors hover:bg-slate-50
                    ${idx < data.length - 1 ? "border-b border-slate-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{q.client}</div>
                    <div className="text-[10px] mt-0.5 text-slate-400">{q.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{q.type}</td>
                  <td className="px-4 py-3 text-slate-500">{q.date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{q.amount}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap [background-color:var(--status-bg)] [color:var(--status-txt)]"
                      style={{ 
                        ["--status-bg" as any]: s.bg, 
                        ["--status-txt" as any]: s.text 
                      }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" title="Preview">
                        <Eye size={12} />
                      </button>
                      <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" title="Edit">
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