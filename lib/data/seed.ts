import "server-only";
import { randomUUID } from "node:crypto";
import {
  calendarEvents,
  clientClinical,
  clients,
  conversations,
  messages,
  quotes,
  reminders,
  tasks,
  type NewCalendarEvent,
  type NewClientRow,
  type NewConversation,
  type NewMessage,
  type NewQuote,
  type NewReminder,
  type NewTask,
} from "@/drizzle/schema";
import type { Tx } from "@/lib/db";
import type { ClientAttributes, Sector } from "@/app/types/clients";
import { INITIAL_EVENTS, INITIAL_REMINDERS } from "@/app/data/calendar";
import { INITIAL_COLUMNS } from "@/app/data/maintenance";
import { INITIAL_CHAT_MESSAGES, INITIAL_CONVERSATIONS } from "@/app/data/messaging";
import { INITIAL_QUOTES } from "@/app/data/quotes";
import { INITIAL_PATIENTS } from "@/app/data/clients";
import { ValidationError } from "@/lib/errors";
import { SOURCE_TO_DB } from "./calendar";
import { dateInZone, instantOf, parseDateInput, parseEuro } from "./format";

const ONE_HOUR_MS = 3_600_000;

/**
 * Attributi demo per settore: chiavi allineate ai campi del preset (sensitive → clinical).
 * Settore senza demo → nessun attributo (fallback in seedDemoData).
 */
const DEMO_ATTRIBUTES: Partial<Record<Sector, { public: ClientAttributes; clinical: ClientAttributes }>> = {
  dentale: {
    public: { referral_source: "Passaparola", privacy_consent: true },
    clinical: { allergies: "Nessuna nota", anticoagulants: false },
  },
  estetico: {
    public: { referral_source: "Web", skin_type: "Mista", privacy_consent: true },
    clinical: { allergies: "Nessuna nota" },
  },
  generico: {
    public: { referral_source: "Social", privacy_consent: true, notes: "" },
    clinical: {},
  },
};

type Copy = Partial<Record<"title" | "description" | "type" | "snippet" | "text", string>>;
type SectorCopy = Record<"events" | "reminders" | "tasks" | "quotes" | "chats" | "messages", Record<string, Copy>>;

/** Sostituzioni testuali per settore, indicizzate per id del mock (messaggi: `${chatId}:${msgId}`). */
const SECTOR_COPY: Partial<Record<Sector, SectorCopy>> = {
  estetico: {
    events: {
      "1": { title: "Trattamento viso — Rossi E.", description: "Slot urgente prenotato dall'AI tramite WhatsApp (Cabina 1)." },
      "2": { title: "Massaggio decontratturante — Ferrari", description: "Seduta di massaggio, cliente Ferrari." },
      "4": { title: "Prima consulenza estetica", description: "Nuova cliente prenotata tramite form online / WhatsApp." },
      "5": { title: "Pacchetto 10 sedute — Mancini", description: "Seconda seduta del pacchetto epilazione laser." },
      "6": { title: "Controllo trattamento — Moretti", description: "Verifica risultati e programma delle sedute successive." },
      "8": { title: "Epilazione laser — Vitali", description: "Ciclo di epilazione laser pre-matrimonio." },
      "9": { title: "Manutenzione & verifica apparecchi laser", description: "Verifica periodica dei dispositivi e sanificazione cabine." },
      "10": { title: "Trattamento viso anti-age — Marchetti", description: "Ciclo di peeling e radiofrequenza viso." },
    },
    reminders: {
      "1": { text: "Controllo tracciabilità prodotti e sanificazione lettini" },
      "2": { text: "Recall WhatsApp: contattare Elena Rossi per verifica dopo trattamento viso" },
      "3": { text: "Ritiro ordine prodotti cosmetici dal fornitore" },
      "4": { text: "Invio promemoria richiamo trattamenti a 15 clienti" },
      "6": { text: "Archiviazione consensi informati e schede cliente firmate" },
    },
    tasks: {
      "1": { title: "Recall trattamenti viso e laser (campagna WhatsApp AI)", description: "Invio sequenza automatica di richiamo per 18 clienti a 6 mesi dall'ultimo trattamento." },
      "2": { title: "Controllo tracciabilità prodotti e sanificazione lettini", description: "Verifica registro lotti e pulizia lettini e apparecchi." },
      "3": { title: "Ordine forniture: prodotti cosmetici e gel per laser", description: "Rifornimento creme, maschere e gel conduttivi." },
      "4": { title: "Piano anti-age Sig. Marchetti", description: "Studio scheda cliente e programma di sedute viso." },
      "5": { title: "Programmazione pacchetti epilazione", description: "Elaborazione pacchetti da 10 sedute e invio proposta alle clienti." },
      "6": { title: "Trattamento viso assegnato: Elena Rossi (oggi h 11:30)", description: "Richiesta urgente gestita via WhatsApp e inserita in Cabina 1." },
      "7": { title: "Sanificazione e manutenzione filtri apparecchi", description: "Disinfezione circuiti e cambio filtri degli apparecchi estetici." },
    },
    quotes: {
      "PDC-001": { type: "Trattamento viso", description: "Pacchetto 10 sedute viso con pulizia profonda e peeling." },
      "PDC-002": { type: "Epilazione laser", description: "Epilazione laser su due zone, 8 sedute con follow-up incluso." },
      "PDC-003": { type: "Pulizia viso & LED", description: "Pulizia viso profonda con idratazione e seduta LED." },
      "PDC-004": { type: "Massaggio", description: "Massaggio decontratturante schiena e cervicale, 5 sedute." },
      "PDC-005": { type: "Trattamento anti-age", description: "Ciclo di radiofrequenza e peeling viso, 4 sedute." },
      "PDC-006": { type: "Epilazione laser", description: "Epilazione laser gambe complete, 8 sedute." },
      "PDC-007": { type: "Pacchetto benessere", description: "Pacchetto 10 sedute combinate viso e corpo con massaggio incluso." },
    },
    chats: {
      "1": { snippet: "Urgenza: forte arrossamento dopo il trattamento..." },
      "2": { snippet: "Disponibilità per il prossimo massaggio?" },
      "3": { snippet: "Grazie per il pacchetto laser!" },
      "4": { snippet: "Indicazioni per il trattamento di giovedì" },
      "5": { snippet: "Confermo seduta laser lunedì ore 15" },
    },
    messages: {
      "1:1": { text: "Buongiorno, ho un forte arrossamento dalla seduta di ieri. Avete un posto urgente oggi?" },
      "1:2": { text: "Buongiorno Elena, comprendiamo l'urgenza. L'estetista ha uno slot oggi alle 11:30 in Cabina 1. Nel frattempo eviti esposizione solare. Confermiamo l'orario?" },
      "2:1": { text: "Salve, mi è arrivato il promemoria per il trattamento viso. Quando c'è disponibilità?" },
      "2:2": { text: "Buongiorno Matteo! Abbiamo disponibilità giovedì alle 10:00 o venerdì alle 16:30. Quale preferisce?" },
      "3:1": { text: "Buongiorno Giulia, le abbiamo allegato il piano dei trattamenti e il preventivo per il pacchetto laser." },
      "3:2": { text: "Grazie per il pacchetto laser! Nei prossimi giorni passo a confermare." },
      "4:1": { text: "Buongiorno, posso avere le indicazioni pre-trattamento per giovedì mattina?" },
      "4:2": { text: "Buongiorno Roberto! Le abbiamo appena inviato via mail le indicazioni. Ci vediamo giovedì alle 09:00." },
      "5:1": { text: "Gentile Valentina, le ricordiamo l'appuntamento per la seduta laser lunedì alle 15:00." },
      "5:2": { text: "Confermo seduta laser lunedì ore 15! Grazie mille." },
    },
  },
  generico: {
    events: {
      "1": { title: "Richiesta urgente — Rossi E.", description: "Slot urgente prenotato dall'AI tramite WhatsApp (Sala 1)." },
      "2": { title: "Consulenza — Ferrari", description: "Appuntamento di consulenza con il cliente Ferrari." },
      "4": { title: "Prima consulenza", description: "Nuovo cliente prenotato tramite form online / WhatsApp." },
      "5": { title: "Appuntamento di follow-up — Mancini", description: "Secondo appuntamento di follow-up sulla pratica." },
      "6": { title: "Verifica pratica — Moretti", description: "Controllo avanzamento pratica e consegna documentazione." },
      "8": { title: "Sopralluogo e preventivo — Vitali", description: "Incontro per la definizione del servizio e del preventivo." },
      "9": { title: "Manutenzione & verifica attrezzature", description: "Verifica periodica delle attrezzature e reintegro materiali." },
      "10": { title: "Pratica complessa — Marchetti", description: "Riunione di avanzamento pratica con documentazione allegata." },
    },
    reminders: {
      "1": { text: "Verifica scadenze documentali delle pratiche in corso" },
      "2": { text: "Recall WhatsApp: contattare Elena Rossi per aggiornamento pratica" },
      "3": { text: "Ritiro documenti dal fornitore" },
      "4": { text: "Invio promemoria follow-up a 15 clienti" },
      "6": { text: "Archiviazione contratti e documenti firmati" },
    },
    tasks: {
      "1": { title: "Recall follow-up clienti (campagna WhatsApp AI)", description: "Invio sequenza automatica di richiamo per 18 clienti a 6 mesi dall'ultimo contatto." },
      "2": { title: "Verifica scadenze pratiche in corso", description: "Controllo registro scadenze e documenti richiesti per ogni pratica." },
      "3": { title: "Ordine forniture: materiali d'ufficio", description: "Rifornimento cancelleria e materiali di consumo." },
      "4": { title: "Predisposizione proposta di servizio Sig. Marchetti", description: "Studio della richiesta e stesura della proposta." },
      "5": { title: "Organizzazione documenti e agenda clienti", description: "Elaborazione documenti e invio telematico ai clienti." },
      "6": { title: "Consulenza assegnata: Elena Rossi (oggi h 11:30)", description: "Richiesta urgente gestita via WhatsApp e inserita in Sala 1." },
      "7": { title: "Manutenzione e pulizia postazioni di lavoro", description: "Verifica e pulizia delle postazioni e delle attrezzature." },
    },
    quotes: {
      "PDC-001": { type: "Consulenza", description: "Consulenza completa con analisi della pratica e piano operativo." },
      "PDC-002": { type: "Servizio annuale", description: "Gestione annuale con 24 aggiornamenti periodici e revisione inclusa." },
      "PDC-003": { type: "Servizio base", description: "Preparazione documentazione e assistenza con revisione finale." },
      "PDC-004": { type: "Pratica", description: "Pratica completa con documentazione tecnica e assistenza dedicata." },
      "PDC-005": { type: "Preventivo servizio", description: "Servizio personalizzato con 4 moduli operativi." },
      "PDC-006": { type: "Pratica urgente", description: "Pratica urgente gestita con priorità e documentazione completa." },
      "PDC-007": { type: "Progetto complesso", description: "Progetto completo con piano operativo e coordinamento fornitori." },
    },
    chats: {
      "1": { snippet: "Urgenza: ho bisogno di un consulente oggi..." },
      "2": { snippet: "Disponibilità per un appuntamento di follow-up?" },
      "3": { snippet: "Grazie per la proposta di servizio!" },
      "4": { snippet: "Indicazioni per la pratica di giovedì" },
      "5": { snippet: "Confermo appuntamento lunedì ore 15" },
    },
    messages: {
      "1:1": { text: "Buongiorno, ho bisogno di un appuntamento urgente per la mia pratica. Avete posto oggi?" },
      "1:2": { text: "Buongiorno Elena, comprendiamo l'urgenza. Il consulente ha uno slot oggi alle 11:30 in Sala 1. Confermiamo l'orario?" },
      "2:1": { text: "Salve, mi è arrivato il promemoria per il follow-up. Quando c'è disponibilità?" },
      "2:2": { text: "Buongiorno Matteo! Abbiamo disponibilità giovedì alle 10:00 o venerdì alle 16:30. Quale preferisce?" },
      "3:1": { text: "Buongiorno Giulia, le abbiamo allegato la proposta di servizio e il preventivo." },
      "3:2": { text: "Grazie per la proposta di servizio! Nei prossimi giorni passo a confermare." },
      "4:1": { text: "Buongiorno, posso avere le indicazioni per la pratica di giovedì mattina?" },
      "4:2": { text: "Buongiorno Roberto! Le abbiamo appena inviato via mail il documento con le istruzioni. Ci vediamo giovedì alle 09:00." },
      "5:1": { text: "Gentile Valentina, le ricordiamo l'appuntamento di lunedì alle 15:00." },
      "5:2": { text: "Confermo appuntamento lunedì ore 15! Grazie mille." },
    },
  },
};

/**
 * Testo del mock sostituito per settore; per 'dentale' ritorna sempre il fallback (mock originale).
 * Settore senza testi propri → testi 'generico'.
 */
function sectorCopy(
  sector: Sector,
  table: keyof SectorCopy,
  id: string,
  field: keyof Copy,
  fallback: string,
): string {
  if (sector === "dentale") return fallback;
  const copy = SECTOR_COPY[sector] ?? SECTOR_COPY.generico;
  return copy?.[table][id]?.[field] ?? fallback;
}

function requireDate(value: string, label: string): string {
  const parsed = parseDateInput(value);
  if (!parsed) throw new ValidationError(`Data demo non valida (${label}): ${value}`);
  return parsed;
}

/**
 * Popola uno studio appena creato con i dati demo (app/data/*).
 * Eseguito nella stessa transazione di create_company: all-or-nothing.
 */
export async function seedDemoData(tx: Tx, companyId: string, tz: string, sector: Sector): Promise<void> {
  const now = new Date();
  const today = dateInZone(now, tz);

  const eventRows: NewCalendarEvent[] = INITIAL_EVENTS.map((e) => {
    const startAt = instantOf(e.date, e.time, tz);
    return {
      companyId,
      title: sectorCopy(sector, "events", e.id, "title", e.title),
      description: sectorCopy(sector, "events", e.id, "description", e.description),
      startAt,
      endAt: new Date(startAt.getTime() + ONE_HOUR_MS),
      allDay: false,
      color: e.color,
      source: SOURCE_TO_DB[e.source],
      isAiGenerated: e.isAiGenerated,
    };
  });
  await tx.insert(calendarEvents).values(eventRows);

  const reminderRows: NewReminder[] = INITIAL_REMINDERS.map((r) => ({
    companyId,
    text: sectorCopy(sector, "reminders", r.id, "text", r.text),
    remindAt: instantOf(today, r.time, tz),
    priority: r.priority,
    status: r.status,
  }));
  await tx.insert(reminders).values(reminderRows);

  const taskRows: NewTask[] = INITIAL_COLUMNS.flatMap((col) =>
    col.tasks.map((t, position): NewTask => ({
      companyId,
      title: sectorCopy(sector, "tasks", t.id, "title", t.title),
      description: sectorCopy(sector, "tasks", t.id, "description", t.description),
      priority: t.priority,
      isAi: t.ai,
      columnId: col.id === "in-progress" ? "in_progress" : col.id === "done" ? "done" : "todo",
      position,
      customMetadata: t.assignedTo ? { assignedTo: t.assignedTo } : {},
    }))
  );
  await tx.insert(tasks).values(taskRows);

  // Conversazioni e messaggi in 2 INSERT totali: gli id sono generati lato app,
  // così i messaggi possono referenziare le conversazioni senza RETURNING.
  const conversationRows: NewConversation[] = [];
  const messageRows: NewMessage[] = [];
  for (const chat of INITIAL_CHAT_MESSAGES) {
    const conversationId = randomUUID();
    conversationRows.push({
      id: conversationId,
      companyId,
      name: chat.name,
      snippet: sectorCopy(sector, "chats", chat.id, "snippet", chat.snippet),
      lastMessageAt: now,
      unreadCount: chat.unread,
      isAi: chat.ai,
      initials: chat.initials,
      color: chat.color,
    });

    // Lo storico mock è indicizzato per l'id della chat (stringa)
    const history = INITIAL_CONVERSATIONS[chat.id] ?? [];
    for (const m of history) {
      messageRows.push({
        companyId,
        conversationId,
        senderType: m.from === "ai-draft" ? "ai_draft" : m.from,
        body: sectorCopy(sector, "messages", `${chat.id}:${m.id}`, "text", m.text),
        sentAt: instantOf(today, m.time, tz),
      });
    }
  }
  if (conversationRows.length > 0) await tx.insert(conversations).values(conversationRows);
  if (messageRows.length > 0) await tx.insert(messages).values(messageRows);

  const quoteRows: NewQuote[] = INITIAL_QUOTES.map((q) => ({
    companyId,
    client: q.client,
    quoteType: sectorCopy(sector, "quotes", q.id, "type", q.type),
    quoteDate: requireDate(q.date, "preventivo"),
    status: q.status,
    amount: parseEuro(q.amount).toFixed(2),
    description: sectorCopy(sector, "quotes", q.id, "description", q.description),
    isAiGenerated: q.isAiGenerated,
  }));
  await tx.insert(quotes).values(quoteRows);

  const demo = DEMO_ATTRIBUTES[sector] ?? { public: {}, clinical: {} };
  const clientRows: NewClientRow[] = INITIAL_PATIENTS.map((p) => ({
    companyId,
    code: p.id,
    name: p.name,
    gender: p.gender,
    avatar: p.avatar,
    dateOfBirth: requireDate(p.dateOfBirth, "cliente"),
    phone: p.phone,
    email: p.email,
    address: p.address,
    fiscalCode: p.fiscalCode,
    // Le polizze del mock sono dentali: fuori dal settore dentale nessuna polizza demo
    insurance: sector === "dentale" ? p.insurance : ({} as typeof p.insurance),
    clientType: sector,
    attributes: demo.public,
  }));
  const inserted = await tx
    .insert(clients)
    .values(clientRows)
    .returning({ id: clients.id, code: clients.code });
  const idByCode = new Map(inserted.map((r) => [r.code, r.id]));
  await tx.insert(clientClinical).values(
    INITIAL_PATIENTS.map((p) => ({
      clientId: idByCode.get(p.id)!,
      companyId,
      // Dati clinici dentali solo per 'dentale'; altri settori: riga con i default del DB
      ...(sector === "dentale"
        ? {
            recommendation: p.recommendation,
            previousVisit: p.previousVisit,
            treatments: p.treatments,
          }
        : {}),
      attributes: demo.clinical,
    })),
  );
}
