import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
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
  officina: {
    public: { referral_source: "Passaparola", privacy_consent: true },
    clinical: {},
  },
  parrucchiere: {
    public: { referral_source: "Web", tipo_capelli: "Mossi", colore_abituale: "Castano", privacy_consent: true },
    clinical: { allergie: "Nessuna nota" },
  },
  autolavaggio: {
    public: { referral_source: "Passaparola", abbonamento: "Nessuno", privacy_consent: true },
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
  officina: {
    events: {
      "1": { title: "Diagnosi urgente — Rossi M.", description: "Slot urgente prenotato dall'AI tramite WhatsApp (Ponte 1)." },
      "2": { title: "Diagnosi elettronica — Ferrari", description: "Lettura centralina e verifica errori, cliente Ferrari." },
      "4": { title: "Prima visita veicolo nuovo", description: "Nuovo cliente prenotato tramite form online / WhatsApp." },
      "5": { title: "Cambio freni — Mancini", description: "Sostituzione pastiglie e dischi anteriori." },
      "6": { title: "Revisione — Moretti", description: "Revisione periodica con verifica dei documenti del veicolo." },
      "8": { title: "Riparazione frizione — Vitali", description: "Intervento sulla frizione con preventivo approvato." },
      "9": { title: "Manutenzione ponte sollevatore", description: "Verifica periodica del ponte e dei sistemi di sicurezza." },
      "10": { title: "Tagliando e cambio filtri — Marchetti", description: "Cambio olio motore e sostituzione filtri." },
    },
    reminders: {
      "1": { text: "Controllo scadenze revisioni dei clienti della settimana" },
      "2": { text: "Recall WhatsApp: ricordare il tagliando a Elena Rossi" },
      "3": { text: "Ritiro ricambi ordinati dal fornitore" },
      "4": { text: "Invio promemoria tagliando a 15 clienti" },
      "6": { text: "Archiviazione schede lavoro e fatture" },
    },
    tasks: {
      "1": { title: "Recall tagliandi (campagna WhatsApp AI)", description: "Invio sequenza automatica di richiamo per 18 veicoli in scadenza." },
      "2": { title: "Controllo scadenze revisioni", description: "Verifica del registro revisioni e contatto dei clienti." },
      "3": { title: "Ordine ricambi e lubrificanti", description: "Rifornimento filtri, oli e pastiglie dal fornitore." },
      "4": { title: "Preventivo riparazione Sig. Marchetti", description: "Analisi del guasto e stesura del preventivo." },
      "5": { title: "Programmazione interventi freni", description: "Pianificazione dei cambi pastiglie prenotati per la settimana." },
      "6": { title: "Veicolo assegnato: Elena Rossi (oggi h 11:30)", description: "Richiesta urgente gestita via WhatsApp e inserita nel ponte 1." },
      "7": { title: "Pulizia e manutenzione attrezzature", description: "Verifica di compressore, avvitatori e banco diagnosi." },
    },
    quotes: {
      "PDC-001": { type: "Tagliando", description: "Tagliando completo con olio, filtri e controllo generale." },
      "PDC-002": { type: "Riparazione freni", description: "Sostituzione pastiglie e dischi anteriori con manodopera." },
      "PDC-003": { type: "Diagnosi", description: "Diagnosi elettronica completa con report dei guasti." },
      "PDC-004": { type: "Cambio distribuzione", description: "Kit distribuzione, pompa acqua e manodopera." },
      "PDC-005": { type: "Revisione", description: "Revisione periodica con verifiche di sicurezza ed emissioni." },
      "PDC-006": { type: "Riparazione urgente", description: "Intervento urgente con priorità e ricambi originali." },
      "PDC-007": { type: "Pacchetto manutenzione", description: "Tre tagliandi con sconto e ricambi inclusi." },
    },
    chats: {
      "1": { snippet: "Urgenza: si è accesa la spia del motore..." },
      "2": { snippet: "Disponibilità per la diagnosi di giovedì?" },
      "3": { snippet: "Grazie per il preventivo!" },
      "4": { snippet: "Indicazioni per il ritiro dell'auto" },
      "5": { snippet: "Confermo il tagliando lunedì ore 15" },
    },
    messages: {
      "1:1": { text: "Buongiorno, si è accesa la spia del motore e l'auto perde potenza. Avete un posto urgente oggi?" },
      "1:2": { text: "Buongiorno Elena, comprendiamo l'urgenza. Il meccanico ha uno slot oggi alle 11:30 nel ponte 1. Confermiamo l'orario?" },
      "2:1": { text: "Salve, mi è arrivato il promemoria per la revisione. Quando c'è disponibilità?" },
      "2:2": { text: "Buongiorno Matteo! Abbiamo disponibilità giovedì alle 10:00 o venerdì alle 16:30. Quale preferisce?" },
      "3:1": { text: "Buongiorno Giulia, le abbiamo inviato il preventivo per la riparazione dei freni." },
      "3:2": { text: "Grazie per il preventivo! Nei prossimi giorni passo a confermare." },
      "4:1": { text: "Buongiorno, posso avere le indicazioni per il ritiro dell'auto giovedì mattina?" },
      "4:2": { text: "Buongiorno Roberto! Le abbiamo appena inviato via mail le istruzioni. Ci vediamo giovedì alle 09:00." },
      "5:1": { text: "Gentile Valentina, le ricordiamo il tagliando di lunedì alle 15:00." },
      "5:2": { text: "Confermo il tagliando lunedì ore 15! Grazie mille." },
    },
  },
  parrucchiere: {
    events: {
      "1": { title: "Colore urgente — Rossi E.", description: "Slot urgente prenotato dall'AI tramite WhatsApp (Postazione 1)." },
      "2": { title: "Taglio e piega — Ferrari", description: "Appuntamento taglio e piega, cliente Ferrari." },
      "4": { title: "Prima consulenza capelli", description: "Nuova cliente prenotata tramite form online / WhatsApp." },
      "5": { title: "Meches — Mancini", description: "Schiaritura a meches con trattamento finale." },
      "6": { title: "Controllo colore — Moretti", description: "Verifica del risultato e programma dei trattamenti successivi." },
      "8": { title: "Trattamento ristrutturante — Vitali", description: "Ciclo di trattamenti ristrutturanti per capelli trattati." },
      "9": { title: "Manutenzione postazioni e phon", description: "Verifica periodica di phon, piastre e sanificazione postazioni." },
      "10": { title: "Taglio e barba — Marchetti", description: "Taglio uomo con rifinitura barba." },
    },
    reminders: {
      "1": { text: "Controllo scadenze tinte e prodotti tecnici in magazzino" },
      "2": { text: "Recall WhatsApp: ricordare il colore a Elena Rossi" },
      "3": { text: "Ritiro ordine prodotti dal fornitore" },
      "4": { text: "Invio promemoria richiamo colore a 15 clienti" },
      "6": { text: "Archiviazione schede colore e consensi firmati" },
    },
    tasks: {
      "1": { title: "Recall colore e trattamenti (campagna WhatsApp AI)", description: "Invio sequenza automatica di richiamo per 18 clienti a 6 settimane dall'ultimo colore." },
      "2": { title: "Controllo scadenze prodotti tecnici", description: "Verifica di lotti e scadenze delle tinte in magazzino." },
      "3": { title: "Ordine prodotti tecnici e in rivendita", description: "Rifornimento tinte, ossidanti e prodotti da rivendere." },
      "4": { title: "Piano trattamenti Sig. Marchetti", description: "Studio della scheda cliente e programma di trattamenti." },
      "5": { title: "Programmazione pacchetti meches", description: "Elaborazione pacchetti di meches e invio proposta alle clienti." },
      "6": { title: "Colore assegnato: Elena Rossi (oggi h 11:30)", description: "Richiesta urgente gestita via WhatsApp e inserita in Postazione 1." },
      "7": { title: "Sanificazione postazioni e strumenti", description: "Disinfezione di pettini, forbici e phon." },
    },
    quotes: {
      "PDC-001": { type: "Colore completo", description: "Colore completo con maschera e piega inclusa." },
      "PDC-002": { type: "Meches", description: "Meches su lunghezze medie con tonalizzante." },
      "PDC-003": { type: "Trattamento ristrutturante", description: "Ciclo di 4 trattamenti ristrutturanti con home care." },
      "PDC-004": { type: "Taglio e piega", description: "Taglio personalizzato con piega e consulenza." },
      "PDC-005": { type: "Pacchetto sposa", description: "Acconciatura e trucco per la cerimonia, con prova inclusa." },
      "PDC-006": { type: "Colore urgente", description: "Ritocco colore con priorità e prodotti dedicati." },
      "PDC-007": { type: "Pacchetto benessere capelli", description: "Pacchetto di 6 servizi tra taglio, colore e trattamenti." },
    },
    chats: {
      "1": { snippet: "Urgenza: ho bisogno del ritocco colore oggi..." },
      "2": { snippet: "Disponibilità per un taglio la settimana prossima?" },
      "3": { snippet: "Grazie per il pacchetto meches!" },
      "4": { snippet: "Indicazioni per il colore di giovedì" },
      "5": { snippet: "Confermo appuntamento lunedì ore 15" },
    },
    messages: {
      "1:1": { text: "Buongiorno, ho bisogno di un ritocco colore urgente. Avete posto oggi?" },
      "1:2": { text: "Buongiorno Elena, comprendiamo l'urgenza. La stilista ha uno slot oggi alle 11:30 in Postazione 1. Confermiamo l'orario?" },
      "2:1": { text: "Salve, mi è arrivato il promemoria per il taglio. Quando c'è disponibilità?" },
      "2:2": { text: "Buongiorno Matteo! Abbiamo disponibilità giovedì alle 10:00 o venerdì alle 16:30. Quale preferisce?" },
      "3:1": { text: "Buongiorno Giulia, le abbiamo inviato il preventivo per il pacchetto meches." },
      "3:2": { text: "Grazie per il pacchetto meches! Nei prossimi giorni passo a confermare." },
      "4:1": { text: "Buongiorno, posso avere le indicazioni per il colore di giovedì mattina?" },
      "4:2": { text: "Buongiorno Roberto! Le abbiamo appena inviato via mail le indicazioni. Ci vediamo giovedì alle 09:00." },
      "5:1": { text: "Gentile Valentina, le ricordiamo l'appuntamento di lunedì alle 15:00." },
      "5:2": { text: "Confermo appuntamento lunedì ore 15! Grazie mille." },
    },
  },
  autolavaggio: {
    events: {
      "1": { title: "Lavaggio urgente — Rossi E.", description: "Slot urgente prenotato dall'AI tramite WhatsApp (Corsia 1)." },
      "2": { title: "Lavaggio completo — Ferrari", description: "Lavaggio completo con aspirazione interni, cliente Ferrari." },
      "4": { title: "Primo abbonamento mensile", description: "Nuovo cliente prenotato tramite form online / WhatsApp." },
      "5": { title: "Trattamento ceramico — Mancini", description: "Seconda applicazione del trattamento ceramico." },
      "6": { title: "Controllo lucidatura — Moretti", description: "Verifica del risultato e programma dei lavaggi successivi." },
      "8": { title: "Igienizzazione abitacolo — Vitali", description: "Igienizzazione completa dell'abitacolo e dei filtri." },
      "9": { title: "Manutenzione idropulitrici e aspirapolvere", description: "Verifica periodica delle attrezzature e dei filtri dell'acqua." },
      "10": { title: "Lucidatura carrozzeria — Marchetti", description: "Lucidatura a due fasi della carrozzeria." },
    },
    reminders: {
      "1": { text: "Controllo scorte prodotti per il lavaggio" },
      "2": { text: "Recall WhatsApp: ricordare l'abbonamento a Elena Rossi" },
      "3": { text: "Ritiro ordine prodotti dal fornitore" },
      "4": { text: "Invio promemoria rinnovo abbonamenti a 15 clienti" },
      "6": { text: "Archiviazione abbonamenti e ricevute" },
    },
    tasks: {
      "1": { title: "Recall abbonamenti (campagna WhatsApp AI)", description: "Invio sequenza automatica di richiamo per 18 clienti in scadenza di abbonamento." },
      "2": { title: "Controllo scorte prodotti per il lavaggio", description: "Verifica di shampoo, cere e panni in magazzino." },
      "3": { title: "Ordine forniture: prodotti e accessori", description: "Rifornimento prodotti per il lavaggio e accessori da rivendere." },
      "4": { title: "Preventivo trattamento Sig. Marchetti", description: "Scelta del trattamento ceramico e stesura del preventivo." },
      "5": { title: "Programmazione turni di lavaggio", description: "Organizzazione dei turni e delle prenotazioni della settimana." },
      "6": { title: "Lavaggio assegnato: Elena Rossi (oggi h 11:30)", description: "Richiesta urgente gestita via WhatsApp e inserita in Corsia 1." },
      "7": { title: "Pulizia e manutenzione impianti", description: "Verifica di spazzole, pompe e filtri dell'acqua." },
    },
    quotes: {
      "PDC-001": { type: "Lavaggio completo", description: "Lavaggio esterno e interno con aspirazione e lucidatura vetri." },
      "PDC-002": { type: "Trattamento ceramico", description: "Applicazione di rivestimento ceramico con garanzia." },
      "PDC-003": { type: "Abbonamento mensile", description: "Lavaggi illimitati per un mese con priorità in corsia." },
      "PDC-004": { type: "Igienizzazione", description: "Igienizzazione completa dell'abitacolo con ozono." },
      "PDC-005": { type: "Lucidatura", description: "Lucidatura a due fasi della carrozzeria." },
      "PDC-006": { type: "Abbonamento annuale", description: "Abbonamento annuale con lavaggi illimitati e sconto sugli extra." },
      "PDC-007": { type: "Pacchetto flotta", description: "Lavaggi periodici per una flotta di veicoli aziendali." },
    },
    chats: {
      "1": { snippet: "Urgenza: l'auto è sporca per una cerimonia..." },
      "2": { snippet: "Disponibilità per un lavaggio completo sabato?" },
      "3": { snippet: "Grazie per l'abbonamento!" },
      "4": { snippet: "Indicazioni per il lavaggio di giovedì" },
      "5": { snippet: "Confermo il lavaggio lunedì ore 15" },
    },
    messages: {
      "1:1": { text: "Buongiorno, ho una cerimonia oggi e l'auto è molto sporca. Avete un posto urgente?" },
      "1:2": { text: "Buongiorno Elena, comprendiamo l'urgenza. Abbiamo uno slot oggi alle 11:30 in Corsia 1. Confermiamo l'orario?" },
      "2:1": { text: "Salve, mi è arrivato il promemoria per il lavaggio. Quando c'è disponibilità?" },
      "2:2": { text: "Buongiorno Matteo! Abbiamo disponibilità giovedì alle 10:00 o venerdì alle 16:30. Quale preferisce?" },
      "3:1": { text: "Buongiorno Giulia, le abbiamo inviato il preventivo per l'abbonamento annuale." },
      "3:2": { text: "Grazie per l'abbonamento! Nei prossimi giorni passo a confermare." },
      "4:1": { text: "Buongiorno, posso avere le indicazioni per il lavaggio di giovedì mattina?" },
      "4:2": { text: "Buongiorno Roberto! Le abbiamo appena inviato via mail le indicazioni. Ci vediamo giovedì alle 09:00." },
      "5:1": { text: "Gentile Valentina, le ricordiamo il lavaggio di lunedì alle 15:00." },
      "5:2": { text: "Confermo il lavaggio lunedì ore 15! Grazie mille." },
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

const SEED_PERMISSIONS = [
  "calendar:write", "reminders:write", "tasks:write", "chat:write", "quotes:write", "sensitive:write",
] as const;
type SeedPermission = (typeof SEED_PERMISSIONS)[number];

/** Permessi di scrittura effettivi nello studio (ruolo + moduli attivi del preset), in una query. */
async function writablePermissions(tx: Tx, companyId: string): Promise<Set<SeedPermission>> {
  const rows = (await tx.execute(sql`
    select p from unnest(array[${sql.join(SEED_PERMISSIONS.map((p) => sql`${p}`), sql`, `)}]::text[]) as p
    where public.has_permission(${companyId}::uuid, p)
  `)) as unknown as Array<{ p: SeedPermission }>;
  return new Set(rows.map((r) => r.p));
}

/**
 * Popola uno studio appena creato con i dati demo (app/data/*).
 * Eseguito nella stessa transazione di create_company: all-or-nothing.
 * Popola solo i moduli attivi del preset: con un modulo spento l'RLS rifiuterebbe l'insert.
 */
export async function seedDemoData(tx: Tx, companyId: string, tz: string, sector: Sector): Promise<void> {
  const now = new Date();
  const today = dateInZone(now, tz);
  const can = await writablePermissions(tx, companyId);

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
  if (can.has("calendar:write")) await tx.insert(calendarEvents).values(eventRows);

  const reminderRows: NewReminder[] = INITIAL_REMINDERS.map((r) => ({
    companyId,
    text: sectorCopy(sector, "reminders", r.id, "text", r.text),
    remindAt: instantOf(today, r.time, tz),
    priority: r.priority,
    status: r.status,
  }));
  if (can.has("reminders:write")) await tx.insert(reminders).values(reminderRows);

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
  if (can.has("tasks:write")) await tx.insert(tasks).values(taskRows);

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
  if (can.has("chat:write") && conversationRows.length > 0) {
    await tx.insert(conversations).values(conversationRows);
    if (messageRows.length > 0) await tx.insert(messages).values(messageRows);
  }

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
  if (can.has("quotes:write")) await tx.insert(quotes).values(quoteRows);

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
  // Studio senza modulo dati sensibili: nessuna riga client_clinical (come in createClient).
  if (!can.has("sensitive:write")) return;
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
