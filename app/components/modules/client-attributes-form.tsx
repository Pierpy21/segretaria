"use client";

import { useApiData } from "@/app/hooks/use-api-data";
import { Skeleton, ErrorState } from "@/app/components/ui/async-state";
import type { ClientAttributeValue, ClientAttributes, ClientFieldDefinition } from "@/app/types/api";

const INPUT_CLASS =
  "w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:bg-surface-muted disabled:text-ink-muted";

export interface ClientAttributesFormProps {
  clientType: string;
  values: ClientAttributes;
  onChange: (key: string, value: ClientAttributeValue) => void;
  readOnly?: boolean;
}

/** Form generato dalle definizioni dei campi del tipo cliente (GET /api/clients/fields). */
export default function ClientAttributesForm({ clientType, values, onChange, readOnly = false }: ClientAttributesFormProps) {
  const fieldsHook = useApiData<ClientFieldDefinition[]>(`/api/clients/fields?type=${encodeURIComponent(clientType)}`);

  if (fieldsHook.loading) return <Skeleton className="h-20" />;
  if (fieldsHook.error) return <ErrorState message="Impossibile caricare i campi del cliente." onRetry={fieldsHook.reload} />;

  const fields = fieldsHook.data ?? [];
  if (fields.length === 0) {
    return <p className="text-xs text-ink-muted">Nessun campo personalizzato per questo tipo di cliente.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map(field => {
        const id = `attr-${field.key}`;
        const value = values[field.key] ?? null;
        const reserved = field.sensitive && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            Riservato
          </span>
        );

        if (field.type === "bool") {
          return (
            <label
              key={field.key}
              htmlFor={id}
              className="flex items-center gap-2.5 self-end px-3 py-2 rounded-xl border border-line text-xs font-bold text-ink cursor-pointer"
            >
              <input
                id={id}
                type="checkbox"
                checked={value === true}
                disabled={readOnly}
                onChange={e => onChange(field.key, e.target.checked)}
                className="w-4 h-4 rounded border-line-strong accent-accent"
              />
              <span>{field.label}</span>
              {reserved}
            </label>
          );
        }

        const label = (
          <label htmlFor={id} className="block text-xs font-bold text-ink mb-1">
            {field.label}
            {field.required && <span aria-hidden="true" className="text-red-700"> *</span>}
            {reserved}
          </label>
        );

        if (field.type === "select") {
          return (
            <div key={field.key}>
              {label}
              <select
                id={id}
                value={value === null ? "" : String(value)}
                disabled={readOnly}
                required={field.required}
                onChange={e => onChange(field.key, e.target.value === "" ? null : e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                {field.options.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          );
        }

        const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
        return (
          <div key={field.key}>
            {label}
            <input
              id={id}
              type={inputType}
              value={value === null ? "" : String(value)}
              disabled={readOnly}
              required={field.required}
              onChange={e => {
                const raw = e.target.value;
                if (raw === "") return onChange(field.key, null);
                onChange(field.key, field.type === "number" ? Number(raw) : raw);
              }}
              className={INPUT_CLASS}
            />
          </div>
        );
      })}
    </div>
  );
}
