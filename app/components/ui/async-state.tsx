import { TriangleAlert } from "lucide-react";

/** Blocco pulsante di caricamento */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} aria-hidden="true" />;
}

/** Riga di skeleton per liste/tabelle */
export function SkeletonRows({ rows = 3, className = "h-12" }: { rows?: number; className?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label="Caricamento in corso">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

/** Messaggio di errore con retry opzionale */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
    >
      <span className="flex items-center gap-1.5">
        <TriangleAlert size={12} /> {message}
      </span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline underline-offset-2 hover:text-red-900">
          Riprova
        </button>
      )}
    </div>
  );
}
