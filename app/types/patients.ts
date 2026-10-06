export interface PreviousVisitNote {
  date: string;
  doctor: string;
  summary: string;
  details: string;
  thumbnailUrl?: string;
}

export interface InsuranceCardData {
  provider: string;
  policyNumber: string;
  type: string;
  expiration: string;
}

export interface XRayFinding {
  id: number;
  toothNumber: string;
  toothName: string;
  xPercent: number; // 0-100% position on x-ray
  yPercent: number;
  issue: string;
  severity: "high" | "medium" | "low";
  notes: string;
}

export interface SelectedToothData {
  number: string;
  name: string;
  status: string;
  statusColor: string;
  lastExamination: string;
  aiNote: string;
}

export interface TreatmentHistoryItem {
  id: string;
  date: string;
  treatment: string;
  tooth?: string;
  doctor: string;
  cost: string;
  status: "Completato" | "Pianificato" | "In corso";
}

export interface Patient {
  id: string; // e.g. "PT-2026-0142"
  name: string;
  gender: "F" | "M";
  avatar: string;
  initials: string;
  dateOfBirth: string;
  age: number;
  phone: string;
  email: string;
  address: string;
  fiscalCode: string;
  recommendation: string;
  insurance: InsuranceCardData;
  previousVisit: PreviousVisitNote;
  selectedTooth: SelectedToothData;
  xrayFindings: XRayFinding[];
  treatments: TreatmentHistoryItem[];
}

