-- ============================================================================
-- Migration: vertical_templates (Fase B – settori configurabili)
-- Description:
--   B1. vertical_templates: preset versionati per settore (campi cliente, tipi di
--       appuntamento, moduli attivi, terminologia). apply_vertical_template() li
--       copia nello studio, che poi li personalizza.
--   B2. companies.terms: dizionario di etichette dello studio (copiato dal preset).
--   B3. company_modules: moduli attivabili per studio. Un modulo spento spegne
--       anche i permessi collegati (permission_module) → RLS e API coerenti.
--       "clinical:read" diventa "sensitive:read" / "sensitive:write".
--   B4. company_roles: ruoli personalizzati composti da permessi esistenti,
--       assegnati con company_members.custom_role_id (solo member/accountant).
--       has_permission(company_id, perm): l'RLS legge permessi, non ruoli.
--   Policy dei dati riscritte con has_permission (stesso comportamento per i
--   ruoli di sistema). companies e company_members restano strutturali (ruoli).
-- Mappa ruolo → permessi: DEVE restare allineata a ROLE_PERMISSIONS in
-- lib/auth/permissions.ts (verifica automatica prevista in A1).
-- Depends on: 20261017120000_client_assets.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Settori e terminologia
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies DROP CONSTRAINT companies_sector_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_sector_check
  CHECK (sector IN ('dentale', 'medico', 'commercialista', 'legale', 'estetico', 'generico'));

ALTER TABLE public.companies
  ADD COLUMN template_version INTEGER,
  ADD COLUMN terms JSONB NOT NULL DEFAULT '{}'
  CONSTRAINT companies_terms_object CHECK (jsonb_typeof(terms) = 'object');

-- ----------------------------------------------------------------------------
-- 2. Catalogo permessi, mappa ruolo → permessi, permesso → modulo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permission_catalog()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'clients:read', 'clients:write', 'sensitive:read', 'sensitive:write',
    'chat:read', 'chat:write', 'calendar:read', 'calendar:write',
    'reminders:read', 'reminders:write', 'tasks:read', 'tasks:write',
    'quotes:read', 'quotes:write', 'payments:read', 'payments:write',
    'reports:read', 'records:manage', 'settings:manage', 'members:manage'
  ]::TEXT[];
$$;

-- records:manage = modificare/eliminare record creati da altri (prima: owner/admin;
-- per accountant equivale al vecchio "quotes_update su tutti i preventivi").
CREATE OR REPLACE FUNCTION public.system_role_permissions(p_role TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_role
    WHEN 'owner'  THEN public.permission_catalog()
    WHEN 'admin'  THEN public.permission_catalog()
    WHEN 'member' THEN ARRAY[
      'clients:read', 'clients:write', 'sensitive:read', 'sensitive:write',
      'chat:read', 'chat:write', 'calendar:read', 'calendar:write',
      'reminders:read', 'reminders:write', 'tasks:read', 'tasks:write',
      'quotes:read', 'quotes:write', 'payments:read', 'payments:write',
      'reports:read'
    ]::TEXT[]
    WHEN 'accountant' THEN ARRAY[
      'clients:read', 'quotes:read', 'quotes:write',
      'payments:read', 'payments:write', 'reports:read', 'records:manage'
    ]::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END;
$$;

-- Modulo da cui dipende un permesso (NULL = sempre attivo).
CREATE OR REPLACE FUNCTION public.permission_module(p_permission TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE split_part(p_permission, ':', 1)
    WHEN 'calendar'  THEN 'agenda'
    WHEN 'reminders' THEN 'agenda'
    WHEN 'chat'      THEN 'chat'
    WHEN 'tasks'     THEN 'maintenance'
    WHEN 'quotes'    THEN 'quotes'
    WHEN 'sensitive' THEN 'sensitive_data'
    ELSE NULL
  END;
$$;

-- ----------------------------------------------------------------------------
-- 3. company_modules (B3)
-- ----------------------------------------------------------------------------
CREATE TABLE public.company_modules (
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module     TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (company_id, module),
  CONSTRAINT company_modules_module_check CHECK (
    module IN ('agenda', 'chat', 'quotes', 'maintenance', 'sensitive_data', 'assets', 'ai_assistant')
  )
);

CREATE TRIGGER trg_company_modules_updated_at
  BEFORE UPDATE ON public.company_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_company_modules_immutable_company_id
  BEFORE UPDATE ON public.company_modules
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- Riga assente = modulo attivo (compatibilità con gli studi esistenti).
CREATE OR REPLACE FUNCTION public.module_enabled(p_company_id UUID, p_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_module IS NULL OR coalesce(
    (SELECT enabled FROM public.company_modules WHERE company_id = p_company_id AND module = p_module),
    true
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. company_roles (B4)
-- ----------------------------------------------------------------------------
CREATE TABLE public.company_roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  permissions TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT company_roles_key_unique UNIQUE (company_id, key),
  CONSTRAINT company_roles_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT company_roles_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT company_roles_label_length CHECK (char_length(label) BETWEEN 1 AND 60),
  -- Solo permessi del catalogo; la gestione di studio e membri resta ai ruoli di sistema.
  CONSTRAINT company_roles_permissions_check CHECK (
    permissions <@ public.permission_catalog()
    AND NOT permissions && ARRAY['settings:manage', 'members:manage']::TEXT[]
  )
);

CREATE INDEX idx_company_roles_company ON public.company_roles(company_id);

CREATE TRIGGER trg_company_roles_updated_at
  BEFORE UPDATE ON public.company_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_company_roles_immutable_company_id
  BEFORE UPDATE ON public.company_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

ALTER TABLE public.company_members
  ADD COLUMN custom_role_id UUID,
  ADD CONSTRAINT company_members_custom_role_fkey FOREIGN KEY (custom_role_id, company_id)
    REFERENCES public.company_roles(id, company_id) ON DELETE SET NULL (custom_role_id),
  -- owner/admin hanno sempre tutti i permessi: niente ruolo personalizzato.
  ADD CONSTRAINT company_members_custom_role_base CHECK (
    custom_role_id IS NULL OR role IN ('member', 'accountant')
  );

CREATE INDEX idx_company_members_custom_role ON public.company_members(custom_role_id)
  WHERE custom_role_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. has_permission: permessi effettivi dell'utente corrente nello studio
--    = permessi del ruolo personalizzato (se assegnato) altrimenti del ruolo
--      di sistema, AND modulo collegato attivo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(p_company_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT p_permission = ANY (coalesce(r.permissions, public.system_role_permissions(m.role)))
      AND public.module_enabled(p_company_id, public.permission_module(p_permission))
    FROM public.company_members m
    LEFT JOIN public.company_roles r ON r.id = m.custom_role_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.company_id = p_company_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.permission_catalog()                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.system_role_permissions(TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_module(TEXT)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.module_enabled(UUID, TEXT)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(UUID, TEXT)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_catalog()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_role_permissions(TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_module(TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.module_enabled(UUID, TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT)        TO authenticated;

-- Membri dello studio con email (auth.users non è leggibile dagli utenti).
-- Solo per chi ha members:manage nello studio richiesto.
CREATE OR REPLACE FUNCTION public.get_company_members(p_company_id UUID)
RETURNS TABLE (user_id UUID, email TEXT, role TEXT, custom_role_id UUID, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.user_id, u.email::TEXT, m.role, m.custom_role_id, m.created_at
  FROM public.company_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.company_id = p_company_id
    AND public.has_permission(p_company_id, 'members:manage')
  ORDER BY m.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_company_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_members(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. company_appointment_types (B1)
-- ----------------------------------------------------------------------------
CREATE TABLE public.company_appointment_types (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key              TEXT        NOT NULL,
  label            TEXT        NOT NULL,
  color            TEXT        NOT NULL DEFAULT '#E04A95',
  duration_minutes INTEGER     NOT NULL DEFAULT 30,
  position         INTEGER     NOT NULL DEFAULT 0,
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT company_appointment_types_key_unique UNIQUE (company_id, key),
  CONSTRAINT company_appointment_types_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT company_appointment_types_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT company_appointment_types_color_format CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT company_appointment_types_duration CHECK (duration_minutes BETWEEN 5 AND 600)
);

CREATE INDEX idx_company_appointment_types_company ON public.company_appointment_types(company_id, position);

CREATE TRIGGER trg_company_appointment_types_updated_at
  BEFORE UPDATE ON public.company_appointment_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_company_appointment_types_immutable_company_id
  BEFORE UPDATE ON public.company_appointment_types
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

ALTER TABLE public.calendar_events
  ADD COLUMN appointment_type_id UUID,
  ADD CONSTRAINT calendar_events_appointment_type_fkey FOREIGN KEY (appointment_type_id, company_id)
    REFERENCES public.company_appointment_types(id, company_id) ON DELETE SET NULL (appointment_type_id);

CREATE INDEX idx_calendar_events_appointment_type ON public.calendar_events(appointment_type_id)
  WHERE appointment_type_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. vertical_templates (B1): catalogo globale, sola lettura per gli utenti
--    payload: { terms: {...}, modules: {modulo: bool}, appointment_types: [...],
--               fields: [{entity, client_type, key, label, type, options, required, position, sensitive}] }
--    client_type dei campi cliente = chiave del settore.
-- ----------------------------------------------------------------------------
CREATE TABLE public.vertical_templates (
  key         TEXT        NOT NULL,
  version     INTEGER     NOT NULL,
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  payload     JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (key, version),
  CONSTRAINT vertical_templates_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

ALTER TABLE public.vertical_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vertical_templates FORCE  ROW LEVEL SECURITY;
CREATE POLICY "vertical_templates_select" ON public.vertical_templates
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.vertical_templates TO authenticated;
REVOKE ALL ON public.vertical_templates FROM anon;

INSERT INTO public.vertical_templates (key, version, label, description, payload) VALUES
('dentale', 1, 'Studio dentistico', 'Pazienti, piani di cura, dati clinici e agenda poltrone', $json${
  "terms": {
    "clientSingular": "Paziente", "clientPlural": "Pazienti",
    "quoteSingular": "Piano di cura", "quotePlural": "Piani di cura & Preventivi",
    "ownerTitle": "Dottore", "memberTitle": "Collaboratore", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati clinici", "tasksLabel": "Attività cliniche & studio",
    "clientsSubtitle": "Anagrafica pazienti, storico prestazioni e schede cliniche",
    "chatSubtitle": "Triage urgenze odontoiatriche, recall semestrali e messaggistica WhatsApp",
    "agendaSubtitle": "Planning poltrone cliniche, igiene e chirurgia sincronizzato con Google/Apple",
    "tasksSubtitle": "Kanban operativo: sterilizzazione, laboratorio odontotecnico e ordini forniture",
    "quotesSubtitle": "Preventivi clinici, piani di trattamento e accettazione pazienti",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al paziente",
    "statusApproved": "Accettato dal paziente", "statusDeclined": "Non accettato"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": true, "assets": false, "ai_assistant": true},
  "appointment_types": [
    {"key": "prima_visita", "label": "Prima visita", "color": "#3B82F6", "duration_minutes": 45, "position": 10},
    {"key": "igiene",       "label": "Igiene",       "color": "#10B981", "duration_minutes": 45, "position": 20},
    {"key": "controllo",    "label": "Controllo",    "color": "#F59E0B", "duration_minutes": 30, "position": 30},
    {"key": "chirurgia",    "label": "Chirurgia",    "color": "#EF4444", "duration_minutes": 90, "position": 40}
  ],
  "fields": [
    {"entity": "client", "client_type": "dentale", "key": "referral_source",   "label": "Come ci ha conosciuto",  "type": "select", "options": ["Passaparola","Web","Social","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "dentale", "key": "referring_dentist", "label": "Dentista inviante",      "type": "text",   "options": [], "required": false, "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "dentale", "key": "privacy_consent",   "label": "Consenso privacy",       "type": "bool",   "options": [], "required": true,  "position": 30, "sensitive": false},
    {"entity": "client", "client_type": "dentale", "key": "allergies",         "label": "Allergie",               "type": "text",   "options": [], "required": false, "position": 40, "sensitive": true},
    {"entity": "client", "client_type": "dentale", "key": "anticoagulants",    "label": "Terapia anticoagulante", "type": "bool",   "options": [], "required": false, "position": 50, "sensitive": true}
  ]
}$json$::jsonb),
('medico', 1, 'Studio medico', 'Pazienti, visite, dati sanitari protetti', $json${
  "terms": {
    "clientSingular": "Paziente", "clientPlural": "Pazienti",
    "quoteSingular": "Preventivo", "quotePlural": "Preventivi",
    "ownerTitle": "Medico", "memberTitle": "Collaboratore", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati sanitari", "tasksLabel": "Attività dello studio",
    "clientsSubtitle": "Anagrafica pazienti, storico visite e dati sanitari",
    "chatSubtitle": "Richieste dei pazienti, promemoria visite e messaggistica",
    "agendaSubtitle": "Visite, controlli e certificati sincronizzati con Google/Apple",
    "tasksSubtitle": "Attività operative dello studio",
    "quotesSubtitle": "Preventivi per visite e prestazioni",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al paziente",
    "statusApproved": "Accettato dal paziente", "statusDeclined": "Non accettato"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": true, "assets": false, "ai_assistant": true},
  "appointment_types": [
    {"key": "prima_visita",  "label": "Prima visita",         "color": "#3B82F6", "duration_minutes": 30, "position": 10},
    {"key": "controllo",     "label": "Controllo",            "color": "#10B981", "duration_minutes": 20, "position": 20},
    {"key": "specialistica", "label": "Visita specialistica", "color": "#8B5CF6", "duration_minutes": 45, "position": 30},
    {"key": "certificato",   "label": "Certificato",          "color": "#F59E0B", "duration_minutes": 15, "position": 40}
  ],
  "fields": [
    {"entity": "client", "client_type": "medico", "key": "referral_source",   "label": "Come ci ha conosciuto", "type": "select", "options": ["Passaparola","Web","Medico curante","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "medico", "key": "general_doctor",    "label": "Medico di base",        "type": "text",   "options": [], "required": false, "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "medico", "key": "privacy_consent",   "label": "Consenso privacy",      "type": "bool",   "options": [], "required": true,  "position": 30, "sensitive": false},
    {"entity": "client", "client_type": "medico", "key": "allergies",         "label": "Allergie",              "type": "text",   "options": [], "required": false, "position": 40, "sensitive": true},
    {"entity": "client", "client_type": "medico", "key": "chronic_conditions","label": "Patologie croniche",    "type": "text",   "options": [], "required": false, "position": 50, "sensitive": true},
    {"entity": "client", "client_type": "medico", "key": "current_therapies", "label": "Terapie in corso",      "type": "text",   "options": [], "required": false, "position": 60, "sensitive": true}
  ]
}$json$::jsonb),
('commercialista', 1, 'Studio commercialista', 'Clienti, parcelle, scadenze fiscali', $json${
  "terms": {
    "clientSingular": "Cliente", "clientPlural": "Clienti",
    "quoteSingular": "Parcella", "quotePlural": "Parcelle",
    "ownerTitle": "Commercialista", "memberTitle": "Collaboratore", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati fiscali riservati", "tasksLabel": "Pratiche & scadenze",
    "clientsSubtitle": "Anagrafica clienti, regime fiscale e dati riservati",
    "chatSubtitle": "Richieste dei clienti, invio documenti e comunicazioni",
    "agendaSubtitle": "Consulenze, consegne documenti e scadenze fiscali",
    "tasksSubtitle": "Kanban delle pratiche: dichiarazioni, F24, bilanci",
    "quotesSubtitle": "Parcelle e preventivi per i servizi dello studio",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviata al cliente",
    "statusApproved": "Accettata dal cliente", "statusDeclined": "Non accettata"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": true, "assets": false, "ai_assistant": true},
  "appointment_types": [
    {"key": "consulenza",          "label": "Consulenza",           "color": "#3B82F6", "duration_minutes": 60, "position": 10},
    {"key": "consegna_documenti",  "label": "Consegna documenti",   "color": "#10B981", "duration_minutes": 15, "position": 20},
    {"key": "dichiarazione",       "label": "Dichiarazione redditi","color": "#8B5CF6", "duration_minutes": 45, "position": 30},
    {"key": "scadenza",            "label": "Scadenza fiscale",     "color": "#EF4444", "duration_minutes": 30, "position": 40}
  ],
  "fields": [
    {"entity": "client", "client_type": "commercialista", "key": "subject_type",   "label": "Tipo di soggetto", "type": "select", "options": ["Persona fisica","Ditta individuale","Società di persone","Società di capitali"], "required": true, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "commercialista", "key": "tax_regime",     "label": "Regime fiscale",   "type": "select", "options": ["Ordinario","Semplificato","Forfettario"], "required": false, "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "commercialista", "key": "ateco_code",     "label": "Codice ATECO",     "type": "text",   "options": [], "required": false, "position": 30, "sensitive": false},
    {"entity": "client", "client_type": "commercialista", "key": "pec",            "label": "PEC",              "type": "text",   "options": [], "required": false, "position": 40, "sensitive": false},
    {"entity": "client", "client_type": "commercialista", "key": "privacy_consent","label": "Consenso privacy",  "type": "bool",   "options": [], "required": true,  "position": 50, "sensitive": false},
    {"entity": "client", "client_type": "commercialista", "key": "annual_income",  "label": "Reddito annuo",    "type": "number", "options": [], "required": false, "position": 60, "sensitive": true}
  ]
}$json$::jsonb),
('legale', 1, 'Studio legale', 'Assistiti, pratiche, udienze e dati giudiziari', $json${
  "terms": {
    "clientSingular": "Assistito", "clientPlural": "Assistiti",
    "quoteSingular": "Parcella", "quotePlural": "Parcelle",
    "ownerTitle": "Avvocato", "memberTitle": "Praticante", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati giudiziari", "tasksLabel": "Pratiche & scadenze",
    "clientsSubtitle": "Anagrafica assistiti, controparti e dati riservati",
    "chatSubtitle": "Comunicazioni con gli assistiti e invio documenti",
    "agendaSubtitle": "Udienze, colloqui e firme sincronizzati con Google/Apple",
    "tasksSubtitle": "Kanban delle pratiche: atti, depositi e scadenze processuali",
    "quotesSubtitle": "Parcelle e preventivi per incarichi professionali",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviata all'assistito",
    "statusApproved": "Accettata dall'assistito", "statusDeclined": "Non accettata"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": true, "assets": false, "ai_assistant": true},
  "appointment_types": [
    {"key": "primo_colloquio", "label": "Primo colloquio", "color": "#3B82F6", "duration_minutes": 60,  "position": 10},
    {"key": "consulenza",      "label": "Consulenza",      "color": "#10B981", "duration_minutes": 45,  "position": 20},
    {"key": "udienza",         "label": "Udienza",         "color": "#EF4444", "duration_minutes": 120, "position": 30},
    {"key": "firma_atti",      "label": "Firma atti",      "color": "#F59E0B", "duration_minutes": 30,  "position": 40}
  ],
  "fields": [
    {"entity": "client", "client_type": "legale", "key": "subject_type",    "label": "Tipo di soggetto", "type": "select", "options": ["Persona fisica","Impresa","Ente"], "required": true, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "legale", "key": "practice_area",   "label": "Materia",          "type": "select", "options": ["Civile","Penale","Lavoro","Famiglia","Amministrativo"], "required": false, "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "legale", "key": "counterparty",    "label": "Controparte",      "type": "text",   "options": [], "required": false, "position": 30, "sensitive": false},
    {"entity": "client", "client_type": "legale", "key": "pec",             "label": "PEC",              "type": "text",   "options": [], "required": false, "position": 40, "sensitive": false},
    {"entity": "client", "client_type": "legale", "key": "privacy_consent", "label": "Consenso privacy", "type": "bool",   "options": [], "required": true,  "position": 50, "sensitive": false},
    {"entity": "client", "client_type": "legale", "key": "criminal_records","label": "Precedenti penali","type": "text",   "options": [], "required": false, "position": 60, "sensitive": true},
    {"entity": "client", "client_type": "legale", "key": "confidential_notes","label": "Note riservate", "type": "text",   "options": [], "required": false, "position": 70, "sensitive": true}
  ]
}$json$::jsonb),
('estetico', 1, 'Centro estetico', 'Clienti, trattamenti e pacchetti', $json${
  "terms": {
    "clientSingular": "Cliente", "clientPlural": "Clienti",
    "quoteSingular": "Preventivo", "quotePlural": "Preventivi & Pacchetti",
    "ownerTitle": "Titolare", "memberTitle": "Operatore", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati sanitari", "tasksLabel": "Attività del centro",
    "clientsSubtitle": "Anagrafica clienti, trattamenti e schede",
    "chatSubtitle": "Prenotazioni, promemoria e messaggistica WhatsApp",
    "agendaSubtitle": "Cabine e trattamenti sincronizzati con Google/Apple",
    "tasksSubtitle": "Kanban operativo: ordini prodotti e manutenzione cabine",
    "quotesSubtitle": "Preventivi e pacchetti di trattamenti",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al cliente",
    "statusApproved": "Accettato dal cliente", "statusDeclined": "Non accettato"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": true, "assets": false, "ai_assistant": true},
  "appointment_types": [
    {"key": "viso",        "label": "Trattamento viso", "color": "#E04A95", "duration_minutes": 60, "position": 10},
    {"key": "massaggio",   "label": "Massaggio",        "color": "#8B5CF6", "duration_minutes": 50, "position": 20},
    {"key": "epilazione",  "label": "Epilazione",       "color": "#F59E0B", "duration_minutes": 30, "position": 30},
    {"key": "manicure",    "label": "Manicure",         "color": "#10B981", "duration_minutes": 45, "position": 40}
  ],
  "fields": [
    {"entity": "client", "client_type": "estetico", "key": "referral_source", "label": "Come ci ha conosciuto", "type": "select", "options": ["Passaparola","Web","Social","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "estetico", "key": "skin_type",       "label": "Tipo di pelle",         "type": "select", "options": ["Normale","Secca","Grassa","Mista","Sensibile"], "required": false, "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "estetico", "key": "privacy_consent", "label": "Consenso privacy",      "type": "bool",   "options": [], "required": true,  "position": 30, "sensitive": false},
    {"entity": "client", "client_type": "estetico", "key": "allergies",       "label": "Allergie",              "type": "text",   "options": [], "required": false, "position": 40, "sensitive": true}
  ]
}$json$::jsonb),
('generico', 1, 'Attività generica', 'Segreteria per qualsiasi attività professionale', $json${
  "terms": {
    "clientSingular": "Cliente", "clientPlural": "Clienti",
    "quoteSingular": "Preventivo", "quotePlural": "Preventivi",
    "ownerTitle": "Titolare", "memberTitle": "Collaboratore", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati riservati", "tasksLabel": "Attività",
    "clientsSubtitle": "Anagrafica clienti e schede con i campi dell'attività",
    "chatSubtitle": "Comunicazioni con i clienti e messaggistica",
    "agendaSubtitle": "Appuntamenti sincronizzati con Google/Apple",
    "tasksSubtitle": "Kanban delle attività operative",
    "quotesSubtitle": "Preventivi e accettazione dei clienti",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al cliente",
    "statusApproved": "Accettato dal cliente", "statusDeclined": "Non accettato"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": false, "assets": false, "ai_assistant": true},
  "appointment_types": [
    {"key": "appuntamento", "label": "Appuntamento", "color": "#3B82F6", "duration_minutes": 30, "position": 10},
    {"key": "consulenza",   "label": "Consulenza",   "color": "#10B981", "duration_minutes": 60, "position": 20}
  ],
  "fields": [
    {"entity": "client", "client_type": "generico", "key": "referral_source", "label": "Come ci ha conosciuto", "type": "select", "options": ["Passaparola","Web","Social","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "generico", "key": "privacy_consent", "label": "Consenso privacy",      "type": "bool",   "options": [], "required": true,  "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "generico", "key": "notes",           "label": "Note",                  "type": "text",   "options": [], "required": false, "position": 30, "sensitive": false}
  ]
}$json$::jsonb);

-- ----------------------------------------------------------------------------
-- 8. apply_vertical_template: copia l'ultima versione del preset nello studio.
--    SECURITY INVOKER: valgono le policy (serve settings:manage → owner/admin).
--    Idempotente: non sovrascrive campi, tipi di appuntamento e moduli già presenti.
--    I termini del preset diventano la base; le personalizzazioni dello studio
--    (p_keep_terms = true) restano sopra.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_vertical_template(p_company_id UUID, p_key TEXT, p_keep_terms BOOLEAN DEFAULT false)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tpl public.vertical_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_tpl FROM public.vertical_templates
  WHERE key = p_key ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preset di settore inesistente: %', p_key USING ERRCODE = '22023';
  END IF;

  UPDATE public.companies
  SET sector = v_tpl.key,
      template_version = v_tpl.version,
      terms = CASE WHEN p_keep_terms THEN (v_tpl.payload -> 'terms') || terms ELSE v_tpl.payload -> 'terms' END
  WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio non trovato o non modificabile' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.client_field_definitions
    (company_id, entity, client_type, key, label, type, options, required, position, sensitive)
  SELECT p_company_id, f.entity, f.client_type, f.key, f.label, f.type, f.options, f.required, f.position, f.sensitive
  FROM jsonb_to_recordset(v_tpl.payload -> 'fields') AS f(
    entity TEXT, client_type TEXT, key TEXT, label TEXT, type TEXT,
    options JSONB, required BOOLEAN, position INTEGER, sensitive BOOLEAN)
  ON CONFLICT (company_id, entity, client_type, key) DO NOTHING;

  INSERT INTO public.company_modules (company_id, module, enabled)
  SELECT p_company_id, m.key, m.value::boolean
  FROM jsonb_each_text(v_tpl.payload -> 'modules') AS m
  ON CONFLICT (company_id, module) DO NOTHING;

  INSERT INTO public.company_appointment_types (company_id, key, label, color, duration_minutes, position)
  SELECT p_company_id, a.key, a.label, a.color, a.duration_minutes, a.position
  FROM jsonb_to_recordset(v_tpl.payload -> 'appointment_types') AS a(
    key TEXT, label TEXT, color TEXT, duration_minutes INTEGER, position INTEGER)
  ON CONFLICT (company_id, key) DO NOTHING;

  RETURN v_tpl.version;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) TO authenticated;

-- Studi esistenti: tutti i moduli restano attivi (nessun dato nascosto), poi il
-- preset del loro settore (la migration bypassa l'RLS).
INSERT INTO public.company_modules (company_id, module, enabled)
SELECT c.id, m.module, true
FROM public.companies c
CROSS JOIN unnest(ARRAY['agenda', 'chat', 'quotes', 'maintenance', 'sensitive_data', 'assets', 'ai_assistant']) AS m(module);

SELECT public.apply_vertical_template(id, sector) FROM public.companies;

-- ----------------------------------------------------------------------------
-- 9. RLS delle nuove tabelle
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_modules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_modules           FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.company_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_roles             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.company_appointment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_appointment_types FORCE  ROW LEVEL SECURITY;

-- Moduli e ruoli: letti da tutti i membri (navigazione e permessi effettivi).
CREATE POLICY "company_modules_select" ON public.company_modules
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "company_modules_insert" ON public.company_modules
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "company_modules_update" ON public.company_modules
  FOR UPDATE USING (public.has_permission(company_id, 'settings:manage'))
  WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "company_modules_delete" ON public.company_modules
  FOR DELETE USING (public.has_permission(company_id, 'settings:manage'));

CREATE POLICY "company_roles_select" ON public.company_roles
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "company_roles_insert" ON public.company_roles
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'members:manage'));
CREATE POLICY "company_roles_update" ON public.company_roles
  FOR UPDATE USING (public.has_permission(company_id, 'members:manage'))
  WITH CHECK (public.has_permission(company_id, 'members:manage'));
CREATE POLICY "company_roles_delete" ON public.company_roles
  FOR DELETE USING (public.has_permission(company_id, 'members:manage'));

-- Tipi di appuntamento: letti da chi vede l'agenda, gestiti da settings:manage.
CREATE POLICY "company_appointment_types_select" ON public.company_appointment_types
  FOR SELECT USING (public.has_permission(company_id, 'calendar:read') OR public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "company_appointment_types_insert" ON public.company_appointment_types
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "company_appointment_types_update" ON public.company_appointment_types
  FOR UPDATE USING (public.has_permission(company_id, 'settings:manage'))
  WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "company_appointment_types_delete" ON public.company_appointment_types
  FOR DELETE USING (public.has_permission(company_id, 'settings:manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_modules           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_roles             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_appointment_types TO authenticated;
REVOKE ALL ON public.company_modules           FROM anon;
REVOKE ALL ON public.company_roles             FROM anon;
REVOKE ALL ON public.company_appointment_types FROM anon;

-- ----------------------------------------------------------------------------
-- 10. Policy dei dati riscritte con has_permission
--     Schema per tabella con prefisso P:
--       SELECT  P:read
--       INSERT  P:write
--       UPDATE/DELETE  P:write AND (records:manage OR created_by = utente)
--     Le RESTRICTIVE *_no_accountant non servono più: i permessi le coprono.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('clients',         'clients'),
    ('client_assets',   'clients'),
    ('calendar_events', 'calendar'),
    ('reminders',       'reminders'),
    ('tasks',           'tasks'),
    ('conversations',   'chat'),
    ('messages',        'chat'),
    ('quotes',          'quotes')
  ) AS t(tbl, perm)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_select', v.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_insert', v.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_update', v.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_delete', v.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_no_accountant', v.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_insert_no_accountant', v.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_update_no_accountant', v.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v.tbl || '_delete_no_accountant', v.tbl);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.has_permission(company_id, %L))',
      v.tbl || '_select', v.tbl, v.perm || ':read');
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.has_permission(company_id, %L))',
      v.tbl || '_insert', v.tbl, v.perm || ':write');
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE
         USING (public.has_permission(company_id, %L)
                AND (public.has_permission(company_id, ''records:manage'') OR created_by = (SELECT auth.uid())))
         WITH CHECK (public.has_permission(company_id, %L))',
      v.tbl || '_update', v.tbl, v.perm || ':write', v.perm || ':write');
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE
         USING (public.has_permission(company_id, %L)
                AND (public.has_permission(company_id, ''records:manage'') OR created_by = (SELECT auth.uid())))',
      v.tbl || '_delete', v.tbl, v.perm || ':write');
  END LOOP;
END $$;

-- client_clinical → dati sensibili (sensitive:*). Update: records:manage oppure
-- chi ha creato il cliente; delete solo records:manage (di norma in cascata).
DROP POLICY "client_clinical_select" ON public.client_clinical;
DROP POLICY "client_clinical_insert" ON public.client_clinical;
DROP POLICY "client_clinical_update" ON public.client_clinical;
DROP POLICY "client_clinical_delete" ON public.client_clinical;

CREATE POLICY "client_clinical_select" ON public.client_clinical
  FOR SELECT USING (public.has_permission(company_id, 'sensitive:read'));
CREATE POLICY "client_clinical_insert" ON public.client_clinical
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'sensitive:write'));
CREATE POLICY "client_clinical_update" ON public.client_clinical
  FOR UPDATE USING (
    public.has_permission(company_id, 'sensitive:write')
    AND (
      public.has_permission(company_id, 'records:manage')
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_clinical.client_id AND c.created_by = (SELECT auth.uid())
      )
    )
  ) WITH CHECK (public.has_permission(company_id, 'sensitive:write'));
CREATE POLICY "client_clinical_delete" ON public.client_clinical
  FOR DELETE USING (
    public.has_permission(company_id, 'sensitive:write')
    AND public.has_permission(company_id, 'records:manage')
  );

-- Definizioni dei campi e connessioni calendario: settings:manage.
DROP POLICY "client_field_definitions_insert" ON public.client_field_definitions;
DROP POLICY "client_field_definitions_update" ON public.client_field_definitions;
DROP POLICY "client_field_definitions_delete" ON public.client_field_definitions;
CREATE POLICY "client_field_definitions_insert" ON public.client_field_definitions
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "client_field_definitions_update" ON public.client_field_definitions
  FOR UPDATE USING (public.has_permission(company_id, 'settings:manage'))
  WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "client_field_definitions_delete" ON public.client_field_definitions
  FOR DELETE USING (public.has_permission(company_id, 'settings:manage'));

DROP POLICY "calendar_connections_select" ON public.calendar_connections;
DROP POLICY "calendar_connections_insert" ON public.calendar_connections;
DROP POLICY "calendar_connections_update" ON public.calendar_connections;
DROP POLICY "calendar_connections_delete" ON public.calendar_connections;
CREATE POLICY "calendar_connections_select" ON public.calendar_connections
  FOR SELECT USING (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "calendar_connections_insert" ON public.calendar_connections
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "calendar_connections_update" ON public.calendar_connections
  FOR UPDATE USING (public.has_permission(company_id, 'settings:manage'))
  WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "calendar_connections_delete" ON public.calendar_connections
  FOR DELETE USING (public.has_permission(company_id, 'settings:manage'));

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
