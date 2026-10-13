// Server-only. Persistenza JSON dei token e dello stato di sincronizzazione.
// File: <cwd>/.data/calendar-sync.json (cartella già in .gitignore).
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CalendarSyncError } from "./errors";

export interface GoogleAuth {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms di scadenza dell'access token */
  expiresAt: number;
  account?: string;
  lastSync?: string;
}

export interface AppleAuth {
  calendarUrl: string;
  calendarName: string;
  lastSync?: string;
}

export interface CalendarStore {
  google?: GoogleAuth;
  apple?: AppleAuth;
}

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "calendar-sync.json");

// Serializza le scritture nel processo per evitare read-modify-write concorrenti.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function readStore(): Promise<CalendarStore> {
  let raw: string;
  try {
    raw = await readFile(STORE_FILE, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    return parsed as CalendarStore;
  } catch {
    // Non sovrascrivere silenziosamente un file corrotto (perderebbe i token).
    throw new CalendarSyncError("File di stato della sincronizzazione calendario corrotto", 500);
  }
}

async function writeStore(store: CalendarStore): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
    await rename(tmp, STORE_FILE);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Applica una mutazione allo store in modo atomico (nel processo) e restituisce lo stato salvato. */
export function updateStore(
  mutator: (current: CalendarStore) => CalendarStore | Promise<CalendarStore>,
): Promise<CalendarStore> {
  const run = writeQueue.then(async () => {
    const current = await readStore();
    const next = await mutator(current);
    await writeStore(next);
    return next;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}
