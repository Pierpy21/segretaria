"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import {
  Search,
  Calendar,
  Phone,
  MapPin,
  ChevronRight,
  Shield,
  Sparkles,
  ArrowLeft,
  Plus,
  UserCheck,
  CheckCircle2,
  Clock,
  Printer,
  SlidersHorizontal,
  LoaderCircle,
  X,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { refreshBadges } from "@/app/hooks/use-sidebar-badges";
import { useMe } from "@/app/hooks/use-me";
import { hasPermission } from "@/lib/auth/permissions";
import { Skeleton, SkeletonRows, ErrorState } from "@/app/components/ui/async-state";
import type { Patient } from "@/app/types/patients";
import type { CreatePatientInput } from "@/app/types/api";

interface PatientForm {
  name: string;
  gender: "F" | "M";
  dateOfBirth: string; // YYYY-MM-DD dal input date
  phone: string;
  email: string;
  address: string;
  fiscalCode: string;
}

const EMPTY_FORM: PatientForm = {
  name: "",
  gender: "F",
  dateOfBirth: "",
  phone: "",
  email: "",
  address: "",
  fiscalCode: "",
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

/** "1995-06-14" → "14 giugno 1995" (formato usato nelle schede) */
function formatBirthDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Campi obbligatori per il tipo Patient; quelli clinici partono vuoti e si completano in seguito */
function buildNewPatient(f: PatientForm): CreatePatientInput {
  return {
    name: f.name.trim(),
    gender: f.gender,
    avatar: "",
    dateOfBirth: formatBirthDate(f.dateOfBirth),
    phone: f.phone.trim(),
    email: f.email.trim(),
    address: f.address.trim(),
    fiscalCode: f.fiscalCode.trim().toUpperCase(),
    recommendation: "",
    insurance: { provider: "Privato", policyNumber: "", type: "Nessuna", expiration: "" },
    previousVisit: { date: "", doctor: "", summary: "Nessuna visita precedente", details: "" },
    selectedTooth: { number: "", name: "", status: "", statusColor: "#94a3b8", lastExamination: "", aiNote: "" },
    xrayFindings: [],
    treatments: [],
  };
}

/** Foto del paziente oppure iniziali se la foto manca */
function PatientAvatar({ patient, className }: { patient: Pick<Patient, "name" | "avatar" | "initials">; className: string }) {
  return (
    <div className={`relative rounded-full overflow-hidden flex-shrink-0 bg-surface-muted flex items-center justify-center ${className}`}>
      {patient.avatar ? (
        <Image src={patient.avatar} alt={patient.name} fill unoptimized className="object-cover" sizes="48px" />
      ) : (
        <span className="text-[11px] font-bold text-ink-muted">{patient.initials}</span>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const patientsHook = useApiData<Patient[]>("/api/patients");
  const patients = patientsHook.data ?? [];
  const { data: me } = useMe();
  // Le API omettono i campi clinici senza clinical:read: le sezioni cliniche restano nascoste
  const canWrite = hasPermission(me?.role, "patients:write");
  const canClinical = hasPermission(me?.role, "clinical:read");

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"detail" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [xrayInvert, setXrayInvert] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dettaglio completo dal server; nel frattempo si usa la riga della lista
  const detailHook = useApiData<Patient>(
    viewMode === "detail" && selectedPatientId ? `/api/patients/${encodeURIComponent(selectedPatientId)}` : null
  );
  const listItem = patients.find(p => p.id === selectedPatientId) ?? null;
  const currentPatient: Patient | null =
    detailHook.data && detailHook.data.id === selectedPatientId ? detailHook.data : listItem;

  const query = searchQuery.trim().toLowerCase();
  const filteredPatients = patients.filter(
    p =>
      p.name.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query) ||
      p.phone.includes(searchQuery.trim())
  );

  function openDetail(id: string) {
    setSelectedPatientId(id);
    setViewMode("detail");
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowNewModal(true);
  }

  async function submitPatient(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Inserisci nome e cognome.");
      return;
    }
    if (!form.dateOfBirth) {
      setFormError("Inserisci la data di nascita.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<Patient>("/api/patients", {
        method: "POST",
        body: JSON.stringify(buildNewPatient(form)),
      });
      patientsHook.mutate(list => [...(list ?? []), created]);
      refreshBadges();
      setShowNewModal(false);
      openDetail(created.id);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const newPatientModal = showNewModal && (
    <div className="fixed inset-0 z-50 bg-sidebar/40 flex items-center justify-center p-4">
      <form onSubmit={submitPatient} className="bg-surface rounded-2xl border border-line w-full max-w-md p-5 space-y-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <p className="text-sm font-bold text-ink">Nuovo Paziente</p>
          <button type="button" onClick={() => setShowNewModal(false)} className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Chiudi">
            <X size={15} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="p-name" className="block text-xs font-bold text-ink mb-1">Nome e cognome</label>
            <input
              id="p-name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="p-dob" className="block text-xs font-bold text-ink mb-1">Data di nascita</label>
            <input
              id="p-dob"
              type="date"
              value={form.dateOfBirth}
              onChange={e => setForm({ ...form, dateOfBirth: e.target.value })}
              className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="p-gender" className="block text-xs font-bold text-ink mb-1">Sesso</label>
            <select
              id="p-gender"
              value={form.gender}
              onChange={e => setForm({ ...form, gender: e.target.value as "F" | "M" })}
              className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="F">Femmina</option>
              <option value="M">Maschio</option>
            </select>
          </div>
          <div>
            <label htmlFor="p-phone" className="block text-xs font-bold text-ink mb-1">Telefono</label>
            <input
              id="p-phone"
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="p-email" className="block text-xs font-bold text-ink mb-1">Email</label>
            <input
              id="p-email"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="p-address" className="block text-xs font-bold text-ink mb-1">Indirizzo</label>
            <input
              id="p-address"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="p-cf" className="block text-xs font-bold text-ink mb-1">Codice fiscale</label>
            <input
              id="p-cf"
              value={form.fiscalCode}
              onChange={e => setForm({ ...form, fiscalCode: e.target.value })}
              className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong uppercase outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
        {formError && <p className="text-xs font-semibold text-red-800">{formError}</p>}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button
            type="button"
            onClick={() => setShowNewModal(false)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm disabled:opacity-60"
          >
            {submitting && <LoaderCircle size={12} className="animate-spin" />}
            Salva Paziente
          </button>
        </div>
      </form>
    </div>
  );

  // ── Stato iniziale: caricamento / errore / elenco vuoto ──
  if (viewMode === "list" && patientsHook.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <div className="bg-surface rounded-2xl border border-line p-4">
          <SkeletonRows rows={5} className="h-12" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top Bar / Header ── */}
      <div className="bg-surface rounded-2xl border border-line px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          {viewMode === "detail" ? (
            <button
              onClick={() => setViewMode("list")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted hover:bg-line hover:text-accent-text border border-line-strong transition-all shadow-xs cursor-pointer"
            >
              <ArrowLeft size={15} /> ← Torna all&apos;Elenco Pazienti
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent-text flex items-center justify-center">
                <UserCheck size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">Elenco Pazienti Studio</h2>
                <p className="text-xs text-ink-muted">{patients.length} cartelle cliniche registrate — Seleziona un paziente per aprire la scheda</p>
              </div>
            </div>
          )}

          {viewMode === "detail" && patients.length > 0 && (
            <div className="flex items-center gap-2 pl-3 border-l border-line">
              <span className="text-xs font-bold text-ink-muted">Paziente:</span>
              <select
                value={selectedPatientId ?? ""}
                onChange={e => openDetail(e.target.value)}
                className="text-xs font-bold text-ink bg-surface-muted border border-line-strong rounded-xl px-3 py-1.5 outline-none focus:border-accent cursor-pointer"
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* View mode toggle & Action buttons */}
        <div className="flex items-center gap-2">
          {viewMode === "detail" && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
              Scheda Clinica Aperta
            </span>
          )}
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors"
            >
              <Plus size={14} /> Nuovo Paziente
            </button>
          )}
        </div>
      </div>

      {patientsHook.error && <ErrorState message="Impossibile caricare i pazienti." onRetry={patientsHook.reload} />}

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && patients.length === 0 && !patientsHook.error && (
        <div className="bg-surface rounded-2xl border border-line p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
            <UserCheck size={20} className="text-accent" />
          </div>
          <p className="text-sm font-semibold text-ink">Nessun paziente registrato</p>
          <p className="text-xs text-ink-muted mt-1 mb-4">Aggiungi il primo paziente per aprire la sua cartella clinica.</p>
          {canWrite && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover"
            >
              <Plus size={14} /> Aggiungi primo paziente
            </button>
          )}
        </div>
      )}

      {viewMode === "list" && patients.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3 bg-surface-muted/50">
            <div className="flex items-center gap-2 max-w-sm flex-1 bg-surface border border-line-strong rounded-xl px-3 py-2 text-xs shadow-2xs">
              <Search size={14} className="text-ink-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cerca per nome, codice cartella, telefono..."
                className="bg-transparent outline-none flex-1 text-ink placeholder:text-ink-muted font-medium"
              />
            </div>
            <p className="text-xs font-medium text-ink-muted">
              Clicca su un paziente per visualizzare la <strong className="text-ink">Scheda Clinica & Radiografia</strong>
            </p>
          </div>

          {filteredPatients.length === 0 && (
            <p className="px-5 py-8 text-center text-xs text-ink-muted">Nessun paziente corrisponde alla ricerca.</p>
          )}

          {/* Mobile Patient Cards */}
          <div className="md:hidden divide-y divide-line">
            {filteredPatients.map(p => (
              <div
                key={p.id}
                onClick={() => openDetail(p.id)}
                className="p-4 hover:bg-accent/5 cursor-pointer transition-colors active:bg-accent/10"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <PatientAvatar patient={p} className="w-10 h-10 border border-line" />
                    <div>
                      <p className="font-bold text-ink text-sm leading-tight">{p.name}</p>
                      <p className="text-[11px] text-ink-muted">{p.id} · {p.dateOfBirth}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-accent-text bg-accent/10">
                    Apri →
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-muted mt-2 pt-2 border-t border-line">
                  <span className="font-medium text-ink-muted">{p.phone}</span>
                  {canClinical && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 truncate max-w-[170px]">
                      {p.recommendation}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-muted border-b border-line text-ink font-bold">
                <tr>
                  <th className="px-5 py-3">Paziente</th>
                  <th className="px-5 py-3">ID Cartella</th>
                  <th className="px-5 py-3">Data di Nascita</th>
                  <th className="px-5 py-3">Contatti</th>
                  <th className="px-5 py-3">Convenzione / Tessera</th>
                  {canClinical && <th className="px-5 py-3">Stato Recall</th>}
                  <th className="px-5 py-3 text-right">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredPatients.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => openDetail(p.id)}
                    className="hover:bg-accent/5 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <PatientAvatar patient={p} className="w-9 h-9 border border-line" />
                        <div>
                          <p className="font-bold text-ink text-sm">{p.name}</p>
                          <p className="text-[11px] text-ink-muted">{p.fiscalCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-ink">{p.id}</td>
                    <td className="px-5 py-3.5 text-ink">
                      {p.dateOfBirth} ({p.age} anni)
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-ink">{p.phone}</p>
                      <p className="text-ink-muted text-[11px]">{p.email}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-accent/10 text-accent-text border border-accent-soft">
                        <Shield size={10} /> {p.insurance.provider}
                      </span>
                    </td>
                    {canClinical && (
                      <td className="px-5 py-3.5">
                        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 max-w-[220px] truncate">
                          {p.recommendation}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-right">
                      <button className="px-3 py-1.5 rounded-lg text-xs font-bold text-accent-text bg-accent/10 hover:bg-accent/20 transition-colors">
                        Apri Cartella →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {viewMode === "detail" && !currentPatient && (
        detailHook.error ? (
          <ErrorState message="Impossibile caricare la scheda del paziente." onRetry={detailHook.reload} />
        ) : (
          <Skeleton className="h-96" />
        )
      )}

      {viewMode === "detail" && currentPatient && (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
          {/* ══════════ LEFT COLUMN ══════════ */}
          <div className="space-y-3.5">
            {canClinical && (
            <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs hover:border-line-strong transition-all">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-surface-muted flex items-center justify-center text-ink">
                    <Calendar size={13} />
                  </div>
                  <h4 className="text-xs font-bold text-ink">Previous visit note</h4>
                </div>
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-line relative flex-shrink-0 bg-sidebar">
                  <Image src="/dental-xray.png" alt="Xray mini" fill className="object-cover opacity-90" sizes="32px" />
                </div>
              </div>
              <p className="text-xs font-normal text-ink-muted leading-relaxed mb-2.5">
                {currentPatient.previousVisit.details || "Nessuna nota della visita precedente."}
              </p>
              <button className="text-xs font-bold text-accent-text hover:text-ink flex items-center gap-1 transition-colors">
                See visit history <ChevronRight size={13} />
              </button>
            </div>

            )}

            {/* 2. Patient Identity Card */}
            <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs">
              {/* Header profile */}
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <PatientAvatar patient={currentPatient} className="w-12 h-12 border-2 border-line" />
                  <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-accent border-2 border-surface flex items-center justify-center text-[9px] font-bold text-accent-ink">
                    {currentPatient.gender === "F" ? "♀" : "♂"}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink leading-tight">{currentPatient.name}</h3>
                  <p className="text-xs font-semibold text-ink-muted mt-0.5">{currentPatient.id}</p>
                </div>
              </div>

              {/* Recommendation pill */}
              {currentPatient.recommendation && (
                <div className="mb-4 bg-emerald-50/80 border border-emerald-200 rounded-xl px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-800 leading-snug">
                    {currentPatient.recommendation}
                  </p>
                </div>
              )}

              {/* Data fields */}
              <div className="space-y-3 pt-1 border-t border-line">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-ink-muted text-[11px] font-semibold mb-1">
                      <Calendar size={12} className="text-amber-600" />
                      <span>Date of birth</span>
                    </div>
                    <p className="text-xs font-bold text-ink">{currentPatient.dateOfBirth}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-ink-muted text-[11px] font-semibold mb-1">
                      <Phone size={12} className="text-emerald-600" />
                      <span>Phone number</span>
                    </div>
                    <p className="text-xs font-bold text-ink">{currentPatient.phone}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-ink-muted text-[11px] font-semibold mb-1">
                    <MapPin size={12} className="text-accent-text" />
                    <span>Home address</span>
                  </div>
                  <p className="text-xs font-bold text-ink leading-snug">{currentPatient.address}</p>
                </div>
              </div>
            </div>

            {/* 3. Insurance Card */}
            <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs overflow-hidden">
              {/* Virtual credit-card style layout */}
              <div className="rounded-xl p-3.5 bg-gradient-to-br from-surface-muted via-accent-soft/20 to-accent/10 border border-line mb-3 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface text-ink border border-line-strong">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    {currentPatient.insurance.type}
                  </span>
                  <span className="text-[11px] font-bold text-ink-muted">{currentPatient.insurance.provider}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <PatientAvatar patient={currentPatient} className="w-8 h-8 border border-line-strong" />
                  <div>
                    <p className="text-xs font-bold text-ink leading-none">{currentPatient.name}</p>
                    <p className="text-[10px] font-semibold tracking-wider text-ink-muted mt-1">
                      {currentPatient.insurance.policyNumber}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button className="w-full py-2.5 rounded-xl bg-sidebar hover:bg-sidebar-hover text-sidebar-ink text-xs font-bold transition-colors text-center shadow-xs">
                Insurance Card & Tessera
              </button>
            </div>

            {canClinical && (
            <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-ink">
                  {currentPatient.selectedTooth.number || "Nessun dente"} Selected
                </h4>
                {currentPatient.selectedTooth.status && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/10 text-accent-text border border-accent-soft">
                    {currentPatient.selectedTooth.status}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-[1fr_110px] gap-3 items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">
                    Last Examination
                  </p>
                  <p className="text-xs font-bold text-ink mb-2.5">
                    {currentPatient.selectedTooth.lastExamination || "—"}
                  </p>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-ink">
                      <Sparkles size={11} className="text-accent-text" />
                      <span>AI Note</span>
                    </div>
                    <p className="text-[11px] text-ink-muted leading-snug">
                      {currentPatient.selectedTooth.aiNote || "Nessuna nota AI."}
                    </p>
                  </div>
                </div>

                {/* Dental arch graphic */}
                <div className="relative w-[110px] h-[100px] flex items-center justify-center p-1 rounded-xl bg-surface-muted border border-line">
                  <Image
                    src="/dental-arch.png"
                    alt="Dental arch"
                    width={100}
                    height={90}
                    className="object-contain"
                  />
                </div>
              </div>
            </div>
            )}
          </div>

          {/* ══════════ RIGHT COLUMN ══════════ */}
          {canClinical && (
          <div className="space-y-4 min-w-0">
            {/* Dental Panoramic X-Ray Viewer */}
            <div className="bg-sidebar rounded-2xl border border-sidebar-hover overflow-hidden shadow-md flex flex-col">
              {/* X-Ray Header Controls */}
              <div className="px-5 py-3 border-b border-sidebar-hover bg-sidebar flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-xs font-bold text-sidebar-ink">Ortopanoramica Digitale 2D (OPT)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setXrayInvert(!xrayInvert)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-sidebar-ink bg-sidebar-hover hover:bg-sidebar-hover/70 transition-colors"
                  >
                    <SlidersHorizontal size={11} /> {xrayInvert ? "Filtro Positivo" : "Inverti Contrasto"}
                  </button>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-accent/20 text-accent border border-accent/50">
                    HD 4K
                  </span>
                </div>
              </div>

              {/* X-Ray Display Area without markers */}
              <div
                className={`relative w-full aspect-[609/363] overflow-hidden select-none bg-black transition-all ${
                  xrayInvert ? "invert" : ""
                }`}
              >
                <Image
                  src="/dental-xray.png"
                  alt="Dental Panoramic X-Ray"
                  fill
                  priority
                  className="object-cover"
                />
              </div>

              {/* X-Ray footer findings summary */}
              <div className="px-5 py-2.5 bg-sidebar/90 border-t border-sidebar-hover text-[11px] text-sidebar-ink-muted flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Ortopanoramica Digitale Completa (OPT) — Arcata Superiore & Inferiore
                </span>
                <span className="text-sidebar-ink-muted">Sensore CMOS Carestream CS 8100 3D</span>
              </div>
            </div>

            {/* Storico Prestazioni Cliniche & Prossimi Trattamenti */}
            <div className="bg-surface rounded-2xl border border-line p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-ink">Prestazioni Cliniche & Piano di Cura</h3>
                  <p className="text-xs text-ink-muted">Storico trattamenti eseguiti e sedute programmate</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line">
                    <Printer size={12} /> Stampa Scheda
                  </button>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover">
                    <Plus size={12} /> Aggiungi Prestazione
                  </button>
                </div>
              </div>

              {currentPatient.treatments.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-muted">Nessuna prestazione registrata.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-muted border-y border-line text-ink font-bold">
                      <tr>
                        <th className="px-4 py-2.5">Data</th>
                        <th className="px-4 py-2.5">Trattamento Odontoiatrico</th>
                        <th className="px-4 py-2.5">Operatore Clinico</th>
                        <th className="px-4 py-2.5">Importo</th>
                        <th className="px-4 py-2.5">Stato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {currentPatient.treatments.map(t => (
                        <tr key={t.id} className="hover:bg-surface-muted/70 transition-colors">
                          <td className="px-4 py-3 font-semibold text-ink">{t.date}</td>
                          <td className="px-4 py-3 font-bold text-ink">{t.treatment}</td>
                          <td className="px-4 py-3 text-ink-muted">{t.doctor}</td>
                          <td className="px-4 py-3 font-bold text-ink">{t.cost}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border
                                ${
                                  t.status === "Completato"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : t.status === "In corso"
                                    ? "bg-accent/10 text-accent-text border-accent-soft"
                                    : "bg-amber-50 text-amber-800 border-amber-200"
                                }`}
                            >
                              {t.status === "Completato" ? (
                                <CheckCircle2 size={10} />
                              ) : (
                                <Clock size={10} />
                              )}
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {newPatientModal}
    </div>
  );
}
