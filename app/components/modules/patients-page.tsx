"use client";

import { useState } from "react";
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
} from "lucide-react";
import { INITIAL_PATIENTS } from "@/app/data/patients";
import type { Patient } from "@/app/types/patients";

export default function PatientsPage() {
  const [patients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("PT-2026-0142");
  const [viewMode, setViewMode] = useState<"detail" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [xrayInvert, setXrayInvert] = useState(false);

  const currentPatient = patients.find(p => p.id === selectedPatientId) ?? patients[0];


  const filteredPatients = patients.filter(
    p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone.includes(searchQuery)
  );

  return (
    <div className="space-y-4">
      {/* ── Top Bar / Header ── */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          {viewMode === "detail" ? (
            <button
              onClick={() => setViewMode("list")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-300 transition-all shadow-xs cursor-pointer"
            >
              <ArrowLeft size={15} /> ← Torna all&apos;Elenco Pazienti
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <UserCheck size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Elenco Pazienti Studio</h2>
                <p className="text-xs text-slate-500">{patients.length} cartelle cliniche registrate — Seleziona un paziente per aprire la scheda</p>
              </div>
            </div>
          )}

          {viewMode === "detail" && (
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <span className="text-xs font-bold text-slate-500">Paziente:</span>
              <select
                value={currentPatient.id}
                onChange={e => {
                  setSelectedPatientId(e.target.value);
                }}
                className="text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 outline-none focus:border-blue-600 cursor-pointer"
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
          <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors">
            <Plus size={14} /> Nuovo Paziente
          </button>
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2 max-w-sm flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs shadow-2xs">
              <Search size={14} className="text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cerca per nome, codice cartella, telefono..."
                className="bg-transparent outline-none flex-1 text-slate-900 placeholder:text-slate-400 font-medium"
              />
            </div>
            <p className="text-xs font-medium text-slate-600">
              💡 Clicca su un paziente per visualizzare la <strong className="text-slate-900">Scheda Clinica & Radiografia</strong>
            </p>
          </div>


          {/* Mobile Patient Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredPatients.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedPatientId(p.id);
                  setViewMode("detail");
                }}
                className="p-4 hover:bg-blue-50/50 cursor-pointer transition-colors active:bg-blue-100/50"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-100">
                      <Image src={p.avatar} alt={p.name} fill unoptimized className="object-cover" sizes="40px" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm leading-tight">{p.name}</p>
                      <p className="text-[11px] text-slate-500">{p.id} · {p.dateOfBirth}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-blue-600 bg-blue-50">
                    Apri →
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
                  <span className="font-medium text-slate-500">{p.phone}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 truncate max-w-[170px]">
                    {p.recommendation}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="px-5 py-3">Paziente</th>
                  <th className="px-5 py-3">ID Cartella</th>
                  <th className="px-5 py-3">Data di Nascita</th>
                  <th className="px-5 py-3">Contatti</th>
                  <th className="px-5 py-3">Convenzione / Tessera</th>
                  <th className="px-5 py-3">Stato Recall</th>
                  <th className="px-5 py-3 text-right">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPatients.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setViewMode("detail");
                    }}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="relative w-9 h-9 rounded-full overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-100">
                          <Image src={p.avatar} alt={p.name} fill unoptimized className="object-cover" sizes="36px" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                          <p className="text-[11px] text-slate-500">{p.fiscalCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-700">{p.id}</td>
                    <td className="px-5 py-3.5 text-slate-700">
                      {p.dateOfBirth} ({p.age} anni)
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">{p.phone}</p>
                      <p className="text-slate-500 text-[11px]">{p.email}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        <Shield size={10} /> {p.insurance.provider}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 max-w-[220px] truncate">
                        {p.recommendation}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
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

      {/* ── DETAIL VIEW (STYLE ESATTO DALLO SCREENSHOT) ── */}
      {viewMode === "detail" && (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
          {/* ══════════ LEFT COLUMN ══════════ */}
          <div className="space-y-3.5">
            {/* 1. Previous visit note */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-all">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                    <Calendar size={13} />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">Previous visit note</h4>
                </div>
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 relative flex-shrink-0 bg-slate-900">
                  <Image src="/dental-xray.png" alt="Xray mini" fill className="object-cover opacity-90" sizes="32px" />
                </div>
              </div>
              <p className="text-xs font-normal text-slate-600 leading-relaxed mb-2.5">
                {currentPatient.previousVisit.details}
              </p>
              <button className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                See visit history <ChevronRight size={13} />
              </button>
            </div>

            {/* 2. Patient Identity Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              {/* Header profile */}
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-200 relative bg-slate-100">
                    <Image src={currentPatient.avatar} alt={currentPatient.name} fill unoptimized className="object-cover" sizes="48px" />
                  </div>
                  <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-pink-500 border-2 border-white flex items-center justify-center text-[9px] font-bold text-white">
                    {currentPatient.gender === "F" ? "♀" : "♂"}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">{currentPatient.name}</h3>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">{currentPatient.id}</p>
                </div>
              </div>

              {/* Recommendation pill */}
              <div className="mb-4 bg-emerald-50/80 border border-emerald-200 rounded-xl px-3 py-2">
                <p className="text-xs font-semibold text-emerald-800 leading-snug">
                  {currentPatient.recommendation}
                </p>
              </div>

              {/* Data fields */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold mb-1">
                      <Calendar size={12} className="text-amber-500" />
                      <span>Date of birth</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900">{currentPatient.dateOfBirth}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold mb-1">
                      <Phone size={12} className="text-emerald-500" />
                      <span>Phone number</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900">{currentPatient.phone}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold mb-1">
                    <MapPin size={12} className="text-purple-500" />
                    <span>Home address</span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 leading-snug">{currentPatient.address}</p>
                </div>
              </div>
            </div>

            {/* 3. Insurance Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs overflow-hidden">
              {/* Virtual credit-card style layout */}
              <div className="rounded-xl p-3.5 bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/40 border border-slate-200/80 mb-3 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    {currentPatient.insurance.type}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">{currentPatient.insurance.provider}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full overflow-hidden relative border border-slate-300 flex-shrink-0">
                    <Image src={currentPatient.avatar} alt="mini" fill unoptimized className="object-cover" sizes="32px" />

                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 leading-none">{currentPatient.name}</p>
                    <p className="text-[10px] font-semibold tracking-wider text-slate-500 mt-1">
                      {currentPatient.insurance.policyNumber}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors text-center shadow-xs">
                Insurance Card & Tessera
              </button>
            </div>

            {/* 4. Tooth Selected & Odontogram */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-900">
                  {currentPatient.selectedTooth.number} Selected
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  {currentPatient.selectedTooth.status}
                </span>
              </div>

              <div className="grid grid-cols-[1fr_110px] gap-3 items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                    Last Examination
                  </p>
                  <p className="text-xs font-bold text-slate-900 mb-2.5">
                    {currentPatient.selectedTooth.lastExamination}
                  </p>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                      <Sparkles size={11} className="text-purple-600" />
                      <span>AI Note</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {currentPatient.selectedTooth.aiNote}
                    </p>
                  </div>
                </div>

                {/* Dental arch graphic */}
                <div className="relative w-[110px] h-[100px] flex items-center justify-center p-1 rounded-xl bg-slate-50 border border-slate-200">
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
          </div>

          {/* ══════════ RIGHT COLUMN ══════════ */}
          <div className="space-y-4 min-w-0">
            {/* Dental Panoramic X-Ray Viewer */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-md flex flex-col">
              {/* X-Ray Header Controls */}
              <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-xs font-bold text-slate-100">Ortopanoramica Digitale 2D (OPT)</p>
                  <span className="text-[11px] text-slate-400 font-medium">Acquisizione: 16 Maggio 2026</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setXrayInvert(!xrayInvert)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                  >
                    <SlidersHorizontal size={11} /> {xrayInvert ? "Filtro Positivo" : "Inverti Contrasto"}
                  </button>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-700/50">
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
              <div className="px-5 py-2.5 bg-slate-900/90 border-t border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Ortopanoramica Digitale Completa (OPT) — Arcata Superiore & Inferiore
                </span>
                <span className="text-slate-400">Sensore CMOS Carestream CS 8100 3D</span>
              </div>
            </div>


            {/* ── LOWER SECTION (Senza Vital signs e Senza AI Chat) ── */}
            {/* Storico Prestazioni Cliniche & Prossimi Trattamenti */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Prestazioni Cliniche & Piano di Cura</h3>
                  <p className="text-xs text-slate-500">Storico trattamenti eseguiti e sedute programmate</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100">
                    <Printer size={12} /> Stampa Scheda
                  </button>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700">
                    <Plus size={12} /> Aggiungi Prestazione
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-y border-slate-200 text-slate-700 font-bold">
                    <tr>
                      <th className="px-4 py-2.5">Data</th>
                      <th className="px-4 py-2.5">Trattamento Odontoiatrico</th>
                      <th className="px-4 py-2.5">Operatore Clinico</th>
                      <th className="px-4 py-2.5">Importo</th>
                      <th className="px-4 py-2.5">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentPatient.treatments.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-700">{t.date}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{t.treatment}</td>
                        <td className="px-4 py-3 text-slate-600">{t.doctor}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{t.cost}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border
                              ${
                                t.status === "Completato"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : t.status === "In corso"
                                  ? "bg-blue-50 text-blue-800 border-blue-200"
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
