import type { Column, TaskPriority } from "@/app/types/maintenance";

export const INITIAL_COLUMNS: Column[] = [
  {
    id: "todo",
    name: "Da Eseguire",
    accent: "#94a3b8",
    bg: "#f8fafc",
    tasks: [
      { id: 1, title: "Recall semestrale pazienti igiene orale (campagna WhatsApp AI)", priority: "high", ai: true, description: "Invio sequenza automatica di richiamo per 18 pazienti a 6 mesi dall'ultima detartrasi.", assignedTo: "AI Secretary" },
      { id: 2, title: "Controllo test biologico spore autoclave (Lotto #42)", priority: "high", ai: false, description: "Verifica incubazione fiale biologiche e registro cartaceo tracciabilità sterilizzazione.", assignedTo: "Dott. Renzi" },
      { id: 3, title: "Ordine forniture: compositi estetici e fiale articaina", priority: "medium", ai: false, description: "Rifornimento anestetico locale con vasocostrittore e puntali monouso aspirazione.", assignedTo: "Segreteria" },
    ],
  },
  {
    id: "in-progress",
    name: "In Corso",
    accent: "#3b82f6",
    bg: "#eff6ff",
    tasks: [
      { id: 4, title: "Predisposizione piano di cura All-on-4 Sig. Marchetti", priority: "high", ai: false, description: "Studio caso clinico con TAC Cone Beam e simulazione implantare guidata.", assignedTo: "Dott. Renzi" },
      { id: 5, title: "Scansione 3D modelli studio per allineatori ortodontici", priority: "medium", ai: true, description: "Elaborazione file STL intraorale e invio telematico al laboratorio.", assignedTo: "AI Secretary" },
    ],
  },
  {
    id: "done",
    name: "Completati",
    accent: "#10b981",
    bg: "#f0fdf4",
    tasks: [
      { id: 6, title: "Slot urgenza assegnato: Elena Rossi (oggi h 11:30)", priority: "low", ai: true, description: "Triage dolore acuto completato via WhatsApp e inserito in Poltrona 1.", assignedTo: "AI Secretary" },
      { id: 7, title: "Sanificazione e manutenzione filtri aspiratori chirurgici", priority: "low", ai: false, description: "Disinfezione circuiti idrici e cambio filtri cannule riuniti 1 e 2.", assignedTo: "Dott. Renzi" },
    ],
  },
];


export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};
