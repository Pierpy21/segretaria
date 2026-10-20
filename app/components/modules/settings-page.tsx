"use client";

import { useCallback } from "react";
import { useApiData } from "@/app/hooks/use-api-data";
import { useMe } from "@/app/hooks/use-me";
import { ErrorState, Skeleton } from "@/app/components/ui/async-state";
import { can } from "@/lib/auth/permissions";
import type { SettingsResponse } from "@/app/types/api";
import type { SettingsUpdater } from "@/app/components/modules/settings-shared";
import SectorCard from "@/app/components/modules/settings-sector-card";
import ModulesCard from "@/app/components/modules/settings-modules-card";
import TermsCard from "@/app/components/modules/settings-terms-card";
import AppointmentTypesCard from "@/app/components/modules/settings-appointment-types-card";
import RolesCard from "@/app/components/modules/settings-roles-card";

/** Impostazioni dello studio: settore, moduli, terminologia, tipi di appuntamento, ruoli e membri. */
export default function SettingsPage() {
  const { data: me, loading: meLoading } = useMe();
  const canManage = can(me?.permissions, "settings:manage");
  const canManageMembers = can(me?.permissions, "members:manage");

  // Nessuna richiesta finché non si sa che l'utente può gestire lo studio
  const settingsHook = useApiData<SettingsResponse>(canManage ? "/api/settings" : null);
  const { data: settings, loading, error, reload, mutate } = settingsHook;

  const onChange: SettingsUpdater = useCallback(
    update => mutate(prev => (prev ? update(prev) : prev)),
    [mutate]
  );

  if (meLoading) return <Skeleton className="h-72" />;
  if (!canManage) {
    return <ErrorState message="Solo il titolare può modificare le impostazioni dello studio." />;
  }
  if (loading) return <Skeleton className="h-72" />;
  if (error || !settings) {
    return <ErrorState message="Impossibile caricare le impostazioni." onRetry={reload} />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <SectorCard settings={settings} onChange={onChange} />
      <ModulesCard settings={settings} onChange={onChange} />
      <TermsCard settings={settings} onChange={onChange} />
      <AppointmentTypesCard settings={settings} onChange={onChange} />
      {canManageMembers && <RolesCard modules={settings.modules} />}
    </div>
  );
}
