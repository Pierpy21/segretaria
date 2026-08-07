# Documentazione Schema Database V2 — Segretaria AI

> **Versione schema:** 20260729165900_company_onboarding_and_drizzle_safety`
> **Target:** Supabase (PostgreSQL 15+) + Drizzle ORM
> **Architettura:** SaaS B2B Multitenant con Row Level Security (RLS) e Role-Based Access Control (PoLP L2-L5)

---

## Indice

1. [Panoramica Architetturale](#1-panoramica-architetturale)
2. [Soluzione al Vendor Lock-in (Livello Drizzle ORM)](#2-soluzione-al-vendor-lock-in-livello-drizzle-orm)
3. [File di Migrazione SQL (Stato Attuale)](#3-file-di-migrazione-sql-stato-attuale)
4. [Integrazione Drizzle ORM](#4-integrazione-drizzle-orm)
5. [Analisi Principio del Minimo Privilegio (PoLP)](#5-analisi-principio-del-minimo-privilegio-polp)
6. [Sicurezza: Mitigazioni e DX (Developer Experience)](#6-sicurezza-mitigazioni-e-dx-developer-experience)

---

## 1. Panoramica Architetturale

Il sistema è un **SaaS B2B multitenant** ibrido che sfrutta la potenza di calcolo sicura del database (PostgreSQL/Supabase RLS) combinata con la flessibilità e la type-safety di **Drizzle ORM** a livello applicativo (Next.js).

Ogni cliente aziendale (tenant) è isolato rigorosamente tramite la colonna `company_id`.

L'architettura del flusso dati è la seguente:
```
Frontend/Client → Next.js Server (API/Actions) → Drizzle ORM (withRLS) → PostgreSQL (Supabase RLS)
```
- **Autenticazione e Sicurezza (Livello Data):** Demendata a Supabase (`auth.uid()`, Row Level Security).
- **Query, Tipi e Relazioni (Livello App):** Gestite da Drizzle ORM in puro TypeScript, garantendo portabilità e refactoring sicuro.

---

## 2. Soluzione al Vendor Lock-in (Livello Drizzle ORM)

Il problema originale di eccessivo accoppiamento con le API e i tipi generati da Supabase (`supabase.ts`, `.from().select()`) è stato risolto con l'introduzione di Drizzle ORM.

| Livello | Precedente (Accoppiato) | Attuale (Drizzle ORM) | Portabilità |
|---|---|---|---|
| **Schema & Tipi (L1, L3)** | SQL manuale + `supabase.ts` | Definito in `drizzle/schema.ts`. Esporta i tipi (`InferSelect`, `InferInsert`). | ✅ Assoluta |
| **Query (L4)** | Supabase JS SDK (`.eq()`, `.in()`) | Drizzle Query Builder (`db.select().from()`) | ✅ Assoluta |
| **Policy (L2)** | SQL Supabase RLS (`auth.uid()`) | SQL Supabase RLS (Mantenute per sicurezza e velocità) | ⚠️ Vincolata (Trade-off accettato per massima sicurezza) |
| **Autenticazione (L5)** | Supabase Auth | Supabase Auth | ⚠️ Vincolata |

Drizzle ORM ci permette di migrare un domani a Postgres liscio (AWS, Neon, ecc.) conservando il 100% del codice applicativo, dovendo riscrivere "soltanto" le policy di sicurezza e il modulo di login.

---

## 3. File di Migrazione SQL (Stato Attuale)

L'infrastruttura database è definita sequenzialmente attraverso 3 file di migrazione. Non ci sono conflitti, ogni file stratifica e perfeziona la sicurezza del precedente.

### `20260715214055_init_saas_core.sql` (Base)
- Crea le **8 tabelle principali** (`companies`, `company_members`, `calendar_events`, `reminders`, `tasks`, `conversations`, `messages`, `quotes`).
- Crea i **7 Enum** per lo stato di task, appuntamenti, messaggi.
- Abilita e forza (`FORCE RLS`) la Row Level Security.
- Introduce la funzione `get_my_company_ids()` (Security Definer) per la segregazione orizzontale dei tenant (livello L1).

### `20260729162900_role_aware_policies.sql` (Access Control L2-L5)
- **Aggiunta `created_by`:** Introduce la tracciabilità dell'autore su tutte le 6 tabelle dati.
- **Prevenzione Spoofing (Trigger):** Il trigger `set_created_by()` forza *incondizionatamente* `auth.uid()` su INSERT, scartando qualsiasi input manipolato dall'utente.
- **Immutabilità (Trigger):** Il trigger `protect_created_by()` impedisce la modifica dell'autore durante l'UPDATE, rendendo il dato blindato.
- **Ruoli:** Rimpiazza le vecchie policy "piatte" con policy che verificano il ruolo: `get_my_role_in_company()`.
  - Solo `owner` e `admin` possono modificare i record altrui.
  - I `member` possono fare CRUD solo sui propri dati (`created_by = auth.uid()`).
- **Trigger `protect_role_change()`:** Blocca le auto-promozioni. Solo un `owner` può cambiare i ruoli nella company.

### `20260729165900_company_onboarding_and_drizzle_safety.sql` (Fix IDOR & Onboarding)
- **Drop Policy Vulnerabile:** Rimuove la policy di `company_members` che consentiva a chiunque indovinasse l'ID di un'azienda di iscriversi.
- **Auto-enrollment:** Aggiunge un trigger `AFTER INSERT ON companies` (Security Definer) che nomina automaticamente il creatore dell'azienda come `owner`.
- **Inviti Sicuri:** La nuova policy `INSERT` su `company_members` esige che chi invita un utente sia già un `owner` o `admin` in quel tenant.

---

## 4. Integrazione Drizzle ORM

Il database è riflesso nel codice attraverso una struttura modulare in TypeScript.

### `drizzle/schema.ts`
È la **Single Source of Truth** per la struttura dei dati.
- Traduce 1:1 le tabelle e gli enum PostgreSQL (incluse default, not null, constraints).
- Espone i **Type Exports** che sostituiscono integralmente `supabase.ts`. Esempio:
  ```typescript
  export type Task = typeof tasks.$inferSelect;
  export type NewTask = typeof tasks.$inferInsert;
  ```

### `drizzle/relations.ts`
Definisce i legami Foreign Key (`one` e `many`) tra le tabelle per abilitare il Relational Query Builder di Drizzle.
- `companies` ha relazioni `many` con tutto.
- `tasks` appartiene a (`one`) `companies`.

### `drizzle.config.ts`
Configura Drizzle Kit per l'esecuzione di comandi da CLI (es. `npm run db:studio` per esplorare i dati, o `db:push` per prototipazione rapida).

### `lib/db.ts` (Il Client Sicuro)
Il cuore dell'integrazione Drizzle con Supabase RLS. Risolve il problema del bypass delle policy da parte dell'utente superuser.
- Esporta `adminDb`: Client puro usato **esclusivamente** per script di sistema o webhooks che bypassano intenzionalmente l'RLS (Fail-Closed DX).
- Esporta la funzione `withRLS(claims, callback)`:

```typescript
export async function withRLS<T>(
  claims: Record<string, any>,
  callback: (tx: any) => Promise<T>
): Promise<T> {
  return adminDb.transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    return callback(tx);
  });
}
```
**Perché è critico:** Eseguire `adminDb.select()` esporrebbe tutti i tenant del DB. Obbligando gli sviluppatori a usare `withRLS(session.user, tx => tx.select()...)`, si garantisce che PostgreSQL valuti le policy RLS usando il token dell'utente, mettendo in sicurezza i Server Components e le API routes.

---

## 5. Analisi Principio del Minimo Privilegio (PoLP)

Rispetto alla versione iniziale, il database ora soddisfa **tutti e 5 i livelli di privilegio**:

| Livello PoLP | Descrizione | Stato Attuale | Dettaglio Implementazione |
|---|---|---|---|
| **L0 — Autenticazione** | Solo autenticati accedono | ✅ Raggiunto | `auth.uid()` è implicito e obbligatorio in tutto l'albero di dipendenze. |
| **L1 — Isolamento tenant** | Visibilità limitata al tenant | ✅ Raggiunto | `get_my_company_ids()` impone il recinto orizzontale su ogni query `SELECT`. |
| **L2 — Differenziazione ruolo**| `owner`, `admin`, `member` | ✅ Raggiunto | Le policy CRUD si biforcano in base a `get_my_role_in_company()`. |
| **L3 — Proprietà del dato** | Controllo sui record propri | ✅ Raggiunto | `created_by` è iniettato rigidamente. I `member` manipolano solo i propri dati. |
| **L4 — Operazioni distruttive** | Protezione DELETE/DROP | ✅ Raggiunto | Solo `owner` può distruggere la `companies`. Admin/Owner gestiscono i dati globali. |
| **L5 — Segregazione admin** | Gestione ruoli e staff | ✅ Raggiunto | Il trigger impedisce agli admin di nominarsi owner. L'onboarding (inviti) è ristretto. |

---

## 6. Sicurezza: Mitigazioni e DX (Developer Experience)

Non esistono criticità aperte in questo schema. Le vulnerabilità classiche dello stack Supabase sono state sistematicamente chiuse:

1. **Spoofing dell'identità (Chiuso):** Il trigger sovrascrive `created_by` prima dell'inserimento, rendendo impossibile dichiarare di essere un altro utente.
2. **Alterazione della paternità (Chiuso):** Il campo `created_by` non può essere modificato durante un `UPDATE`, impedendo a utenti malintenzionati di scaricare la proprietà dei dati su altri.
3. **IDOR Onboarding (Chiuso):** Le compagnie si auto-assegnano all'utente creante. Iscriversi illegalmente conoscendo l'UUID aziendale fallisce contro la policy di `company_members_insert`.
4. **Bypass RLS in Drizzle (Chiuso):** La nomenclatura `adminDb` agisce da scudo cognitivo (Fail-Closed) contro l'uso accidentale di privilegi elevati. La funzione `withRLS` inietta in modo sicuro e transazionale il contesto utente a Postgres.

Lo schema V2 è solido, ineccepibile sotto il profilo della sicurezza orizzontale e verticale, e pronto per scalare in produzione.
