# Audit Security & Remediation Report (V2)
**Data:** 2026-07-29
**Stato:** FASE 0 - Ricognizione e Verifica (BLOCCATA)

## Blocco Infrastrutturale: Database Inaccessibile
Come richiesto, ho tentato di riavviare il database locale per eseguire le query sul database vivo. La sequenza di riavvio è fallita e si è bloccata.

```bash
$ npx supabase stop
# Il comando va in hang infinito (nessun output per oltre 5 minuti).
# La stessa anomalia si verifica con `docker restart supabase_db_segretaria`, 
# indicando un probabile blocco del demone Docker per questo container, attivo da 13 giorni.
```

In ottemperanza alla regola: *"Se start fallisce, riporta l'errore esatto e fermati: è quello il primo problema da risolvere"*, l'audit tramite query SQL vive (0.1, 0.2, 0.3, 0.4, 0.5, 0.6) è sospeso e riportato come **NON VERIFICATO**.

---

## Esito FASE 0 per le 13 Criticità (Revisionato)

### P0 (Bloccanti)

**P0.1 — Escalation di privilegio via INSERT su `company_members`**
- **Verdetto:** **NON VERIFICATO** (DB offline)
- **Metodo:** Lettura file sorgente `20260715214055_init_saas_core.sql` e `20260729165900_company_onboarding_and_drizzle_safety.sql`.
- **Evidenza:** Nel codice sorgente non compare alcun `UNIQUE(company_id, user_id)` e la policy `company_members_insert` non vincola la colonna `role`.
- **Severità rivista:** **P0 Confermato** (Vulnerabilità architetturale critica in attesa di prova DB).

**P0.2 — SECURITY DEFINER senza `search_path` bloccato**
- **Verdetto:** **NON VERIFICATO** (DB offline)
- **Metodo:** Lettura file sorgente.
- **Evidenza:** Nel codice sorgente le funzioni `get_my_company_ids()`, `get_my_role_in_company()` non dichiarano `SET search_path = ''`.
- **Severità rivista:** **P0 Confermato**.

**P0.3 — Contenimento cross-tenant su INSERT e UPDATE**
- **Verdetto:** **NON VERIFICATO** (DB offline)
- **Metodo:** Lettura file sorgente.
- **Evidenza:** Nel codice sorgente l'UPDATE contiene un `WITH CHECK` (che la criticità originale sosteneva assente), ma permette il trasferimento cross-tenant per utenti multi-azienda.
- **Rimedio (FASE 1):** Richiesto un trigger `BEFORE UPDATE` per rendere `company_id` immutabile. Verrà incluso nella migrazione P0.

**P0.4 — Claims errati in `withRLS` (bug funzionale)**
- **Verdetto:** **NON VERIFICATO** a runtime.
- **Metodo:** Lettura file `lib/db.ts`.
- **Evidenza:** `lib/db.ts` espone `withRLS` accettando `Record<string, any>`, permettendo potenziali mismatch sul campo `sub`.
- **Severità rivista:** P0 (Rischio di lockout o impersonation).

**P0.5 — Configurazione pooling (Porta e prepare)**
- **Verdetto:** **NON VERIFICABILE**
- **Metodo:** Ispezione ambiente e `lib/db.ts`.
- **Evidenza:** `process.env.DATABASE_URL` non è ispezionabile lato deploy in questo ambiente. Se il puntamento remoto è 6543 (Transaction Mode), il client fallirà a causa dell'assenza di `prepare: false` (attualmente mancante nel codice).

---

### P1 (Elevate)

**P1.1 — Protezione dell'ultimo `owner`**
- **Verdetto:** **NON VERIFICATO** (DB offline). 
- **Metodo:** Lettura file sorgente.
- **Evidenza:** Nessun trigger a codice protegge l'ultimo owner da declassazione o eliminazione.

**P1.2 — Policy DELETE su `company_members`**
- **Verdetto:** **NON VERIFICATO** (DB offline).
- **Metodo:** Lettura file sorgente.
- **Evidenza:** Nel sorgente, l'admin è autorizzato a cancellare l'owner per via di una clausola IN ('owner', 'admin') senza limiti sul target.

**P1.3 — Contesto non autenticato**
- **Verdetto:** **NON VERIFICATO** (DB offline).
- **Metodo:** Lettura file sorgente.
- **Evidenza:** Il trigger `set_created_by` forza `NEW.created_by = auth.uid()` incondizionatamente, rompendo script di backend.

**P1.4 — `ON DELETE` verso `auth.users`**
- **Verdetto:** **NON VERIFICATO** (DB offline).
- **Metodo:** Lettura file sorgente.
- **Evidenza:** L'integrità referenziale verso `auth.users` è totalmente assente nel codice (nessuna FK su `user_id` o `created_by`). Questo è grave:
  - `company_members.user_id`: richiede obbligatoriamente **ON DELETE CASCADE** (membership orfane non hanno senso).
  - `tabelle.created_by`: richiede obbligatoriamente **ON DELETE SET NULL** (per non distruggere i record di business quando un autore viene eliminato).
- **Severità rivista:** **P1 Critico** (Rischio GDPR e perdita integrità dati).

**P1.5 — Indici e performance RLS**
- **Verdetto:** **NON VERIFICATO** (DB offline - Explain Analyze non eseguibile).
- **Metodo:** Lettura file sorgente.
- **Evidenza:** Manca l'indice su `created_by`. Il problema maggiore risiede in `get_my_role_in_company(company_id)`: essendo una funzione correlata passata per ogni riga, impedisce l'uso dell'InitPlan e causa n-query su tabelle grandi, un collo di bottiglia letale non risolvibile con soli indici. Il fix `EXISTS (...)` proposto è la strada corretta e sarà testato appena il DB sarà online.

---

### FASE 3 (Governance e DX)

**3.1 — Una sola sorgente di verità**
- **Verdetto:** **CONFERMATA**
- **Metodo:** Lettura file `package.json`.
- **Evidenza:**
  ```json
  "db:push": "drizzle-kit push"
  ```
  Eseguire questo comando distrugge le RLS generate in FASE 1 e 2.

**3.2 — `adminDb` protetto da lint, non da convenzione**
- **Verdetto:** **CONFERMATA**
- **Metodo:** Lettura codice.
- **Evidenza:** Nessuna regola eslint applicata a `adminDb`.

**3.3 — Type safety**
- **Verdetto:** **CONFERMATA**
- **Metodo:** Lettura file `lib/db.ts`.
- **Evidenza:** Linea 49 usa esplicitamente `callback: (tx: any) => Promise<T>`.

---

## 4. Verifiche Mancanti Richieste

**a) `getUser()` vs `getSession()` — priorità massima**
- **Verdetto:** **GIÀ MITIGATA / ASSENTE**
- **Metodo:** Comando grep sulla codebase.
- **Evidenza:**
  ```bash
  $ grep -rn "getSession\|getUser" --include="*.ts" --include="*.tsx" .
  # [Nessun risultato]
  ```
  Non esistono chiamate di autenticazione deboli o forti nei file correnti. L'integrazione auth a livello applicativo non è ancora stata implementata.

**b) RLS enabled e forced**
- **Verdetto:** **NON VERIFICATO** (Il database locale è irraggiungibile per l'esecuzione della query 0.2).

**c) Dump completo delle policy**
- **Verdetto:** **NON VERIFICATO** (Il database locale è irraggiungibile per l'esecuzione della query 0.1).

**d) Call site di `adminDb`**
- **Verdetto:** **ASSENTE (NESSUN USO APPLICATIVO)**
- **Metodo:** Comando grep sulla codebase.
- **Evidenza:**
  ```bash
  $ grep -rn "adminDb" --include="*.ts" --include="*.tsx" .
  c:\Users\ludov\segretaria\lib\db.ts:34:export const adminDb = drizzle(client, {
  c:\Users\ludov\segretaria\lib\db.ts:51:  return adminDb.transaction(async (tx) => {
  ```
  Nessun punto dell'applicazione sta attualmente usando `adminDb`. Viene esportato e referenziato solo internamente al file `db.ts` dal wrapper `withRLS`.

---
**STATO:** Sono fermo per risolvere l'infrastruttura. Il demone Docker per il container `supabase_db_segretaria` (attivo da 13 giorni) non risponde ai comandi CLI (`stop`, `start`) né a `docker restart`. Come devo procedere per ripristinare il database?
