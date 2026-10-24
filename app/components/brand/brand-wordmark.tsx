interface BrandWordmarkProps {
  /** "light" su sfondi scuri (sidebar), "default" su sfondi chiari */
  tone?: "default" | "light";
  className?: string;
}

/** Nome del brand: unico punto in cui il wordmark viene scritto con lo stile. */
export function BrandWordmark({ tone = "default", className = "" }: BrandWordmarkProps) {
  const base = tone === "light" ? "text-brand-ink" : "text-ink";
  return (
    <span className={`font-bold text-xl tracking-tight ${base} ${className}`}>
      Segretar<span className="text-accent">IA</span>
    </span>
  );
}
