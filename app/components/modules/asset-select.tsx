"use client";

import { useId } from "react";
import { useApiData } from "@/app/hooks/use-api-data";
import { useMe } from "@/app/hooks/use-me";
import { INPUT_CLASS } from "@/app/components/modules/client-attributes-form";
import type { ClientAssetOption } from "@/app/types/api";

export interface AssetSelectProps {
  /** Id del bene; "" = nessuno */
  value: string;
  onChange: (assetId: string) => void;
  /** Cliente scelto nel form: se corrisponde a un cliente con beni, mostra solo i suoi */
  clientName?: string;
}

/** Selettore facoltativo del bene. Non viene mostrato se il modulo "assets" è spento o non ci sono beni. */
export default function AssetSelect({ value, onChange, clientName = "" }: AssetSelectProps) {
  const id = useId();
  const { data: me } = useMe();
  const enabled = me?.modules.assets === true;
  const assetsHook = useApiData<ClientAssetOption[]>(enabled ? "/api/assets" : null);
  const assets = assetsHook.data ?? [];
  if (!enabled || assets.length === 0) return null;

  const wanted = clientName.trim().toLowerCase();
  const sameClient = assets.filter(a => a.clientName.toLowerCase() === wanted);
  const shown = sameClient.length > 0 && (!value || sameClient.some(a => a.id === value)) ? sameClient : assets;

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-ink mb-1">Bene (facoltativo)</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">—</option>
        {shown.map(a => (
          <option key={a.id} value={a.id}>
            {a.name}{a.identifier ? ` · ${a.identifier}` : ""} — {a.clientName}
          </option>
        ))}
      </select>
    </div>
  );
}
