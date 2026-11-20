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

export interface TreatmentHistoryItem {
  id: string;
  date: string;
  treatment: string;
  tooth?: string;
  doctor: string;
  cost: string;
  status: "Completato" | "Pianificato" | "In corso";
}

/** Settore dello studio (companies.sector) = tipo cliente di default. */
export type Sector =
  | "dentale" | "medico" | "commercialista" | "legale" | "estetico" | "gommista" | "generico"
  | "officina" | "parrucchiere" | "autolavaggio";
export type ClientFieldType = "text" | "number" | "date" | "select" | "bool";
/** Entità a cui appartiene una definizione: il cliente o un suo bene (client_assets). */
export type FieldEntity = "client" | "asset" | "item" | "work_order";
export type ClientAttributeValue = string | number | boolean | null;
export type ClientAttributes = Record<string, ClientAttributeValue>;

/** Campo personalizzato (client_field_definitions) per company + tipo cliente. */
export interface ClientFieldDefinition {
  clientType: string;
  key: string;
  label: string;
  type: ClientFieldType;
  options: string[];
  required: boolean;
  position: number;
  sensitive: boolean;
}

export interface Client {
  id: string; // e.g. "PT-2026-0142"
  name: string;
  /** Facoltativo (null = non indicato, es. persone giuridiche) */
  gender: "F" | "M" | null;
  avatar: string;
  initials: string;
  /** Facoltativa: formato lungo ("14 giugno 1995"), null se non registrata */
  dateOfBirth: string | null;
  /** Età in anni compiuti, null se la data di nascita manca */
  age: number | null;
  phone: string;
  email: string;
  address: string;
  fiscalCode: string;
  /** Tipo cliente (= settore di default dello studio, es. "dentale") */
  clientType: string;
  /** Campi personalizzati non sensibili (+ sensibili se il permesso sensitive:read) */
  attributes: ClientAttributes;
  recommendation: string;
  insurance: InsuranceCardData;
  previousVisit: PreviousVisitNote;
  treatments: TreatmentHistoryItem[];
}
