import Image from "next/image";

interface BrandMarkProps {
  size?: number;
  className?: string;
  /** true quando l'icona compare da sola (senza wordmark): alt descrittivo */
  standalone?: boolean;
}

/** Icona del brand (public/logo-segretaria.png). Decorativa se accanto al wordmark. */
export function BrandMark({ size = 32, className = "", standalone = false }: BrandMarkProps) {
  return (
    <Image
      src="/logo-segretaria.png"
      alt={standalone ? "SegretarIA" : ""}
      width={size}
      height={size}
      className={`rounded-xl flex-shrink-0 ${className}`}
    />
  );
}
