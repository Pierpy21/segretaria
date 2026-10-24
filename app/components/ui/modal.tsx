"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

interface ModalProps {
  title: string;
  /** Senza onClose la modale non si chiude (es. durante una richiesta in corso) */
  onClose?: () => void;
  role?: "dialog" | "alertdialog";
  /** Elemento che ha aperto la modale: il focus torna lì alla chiusura */
  opener: HTMLElement | null;
  children: ReactNode;
}

/** Modale accessibile: focus iniziale (data-autofocus), Esc per chiudere, Tab confinato, focus di ritorno. */
export function Modal({ title, onClose, role = "dialog", opener, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus iniziale: l'elemento con data-autofocus, altrimenti il primo focusabile.
  // Alla chiusura il focus torna all'elemento che ha aperto la modale.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) {
      const initial = dialog.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(dialog)[0] ?? dialog;
      initial.focus();
    }
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  // Esc chiude; Tab resta confinato nella modale
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = focusableIn(dialog);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-sidebar/40 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface rounded-2xl border border-line w-full max-w-md p-5 space-y-3.5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <p id={titleId} className="text-sm font-bold text-ink">{title}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={!onClose}
            className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted disabled:opacity-40"
            aria-label="Chiudi"
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
