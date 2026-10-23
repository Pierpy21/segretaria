-- ============================================================================
-- Migration: gommista (settore gommista + etichetta del lotto per tipo articolo)
-- Description:
--   1. companies_sector_check += 'gommista'.
--   2. inventory_item_types.lot_label: etichetta del lotto mostrata in UI
--      (es. "DOT" per gli pneumatici). NULL = "Lotto". Nessun if sul settore.
--   3. vertical_templates: preset 'gommista' v1 (unica aggiunta; gli altri preset
--      restano invariati). payload.item_types accetta anche lot_label.
--   4. apply_vertical_template: come prima + lot_label degli item_types.
-- Depends on: 20261023130000_inventory_stock_apply_fix.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Settore
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies DROP CONSTRAINT companies_sector_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_sector_check
  CHECK (sector IN ('dentale', 'medico', 'commercialista', 'legale', 'estetico', 'gommista', 'generico'));

-- ----------------------------------------------------------------------------
-- 2. Etichetta del lotto per tipo articolo
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_item_types
  ADD COLUMN lot_label TEXT,
  ADD CONSTRAINT inventory_item_types_lot_label_length
    CHECK (lot_label IS NULL OR char_length(lot_label) BETWEEN 1 AND 40);

-- ----------------------------------------------------------------------------
-- 3. Preset gommista
--    Beni del cliente: entity 'asset', client_type = asset_type ('veicolo',
--    'deposito_gomme'). Campi articolo: entity 'item', client_type = chiave del
--    tipo articolo ('pneumatici'). Il lotto degli pneumatici è il DOT.
-- ----------------------------------------------------------------------------
INSERT INTO public.vertical_templates (key, version, label, description, payload) VALUES
('gommista', 1, 'Gommista', 'Clienti, veicoli, deposito gomme stagionale e magazzino pneumatici', $json${
  "terms": {
    "clientSingular": "Cliente", "clientPlural": "Clienti",
    "quoteSingular": "Preventivo", "quotePlural": "Preventivi",
    "ownerTitle": "Titolare", "memberTitle": "Operatore", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati riservati", "tasksLabel": "Lavorazioni",
    "clientsSubtitle": "Anagrafica clienti, veicoli e deposito gomme",
    "chatSubtitle": "Richieste dei clienti, promemoria cambio gomme e messaggistica",
    "agendaSubtitle": "Cambi stagionali, montaggi ed equilibrature sincronizzati con Google/Apple",
    "tasksSubtitle": "Kanban delle lavorazioni in officina",
    "quotesSubtitle": "Preventivi per pneumatici e lavorazioni",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al cliente",
    "statusApproved": "Accettato dal cliente", "statusDeclined": "Non accettato",
    "inventoryLabel": "Magazzino gomme", "itemSingular": "Pneumatico", "itemPlural": "Pneumatici",
    "inventorySubtitle": "Pneumatici e accessori con DOT, misure e giacenze"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": false, "assets": true, "ai_assistant": true, "inventory": true},
  "appointment_types": [
    {"key": "cambio_stagionale",    "label": "Cambio stagionale",    "color": "#3B82F6", "duration_minutes": 45, "position": 10},
    {"key": "montaggio",            "label": "Montaggio",            "color": "#10B981", "duration_minutes": 30, "position": 20},
    {"key": "equilibratura",        "label": "Equilibratura",        "color": "#F59E0B", "duration_minutes": 20, "position": 30},
    {"key": "convergenza",          "label": "Convergenza",          "color": "#8B5CF6", "duration_minutes": 30, "position": 40},
    {"key": "riparazione_foratura", "label": "Riparazione foratura", "color": "#EF4444", "duration_minutes": 20, "position": 50}
  ],
  "item_types": [
    {"key": "pneumatici", "label": "Pneumatici", "lot_label": "DOT", "track_lot": true, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": false, "sellable": true, "requires_client_on_issue": false, "position": 10},
    {"key": "accessori",  "label": "Accessori",  "lot_label": null,  "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": false, "position": 20}
  ],
  "fields": [
    {"entity": "client", "client_type": "gommista", "key": "referral_source", "label": "Come ci ha conosciuto", "type": "select", "options": ["Passaparola","Web","Social","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "gommista", "key": "privacy_consent", "label": "Consenso privacy",      "type": "bool",   "options": [], "required": true,  "position": 20, "sensitive": false},

    {"entity": "asset", "client_type": "veicolo", "key": "targa",   "label": "Targa",   "type": "text",   "options": [], "required": true,  "position": 10, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "marca",   "label": "Marca",   "type": "text",   "options": [], "required": false, "position": 20, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "modello", "label": "Modello", "type": "text",   "options": [], "required": false, "position": 30, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "anno",    "label": "Anno",    "type": "number", "options": [], "required": false, "position": 40, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "km",      "label": "Km",      "type": "number", "options": [], "required": false, "position": 50, "sensitive": false},

    {"entity": "asset", "client_type": "deposito_gomme", "key": "misura",        "label": "Misura",                "type": "text",   "options": [], "required": true,  "position": 10, "sensitive": false},
    {"entity": "asset", "client_type": "deposito_gomme", "key": "marca",         "label": "Marca",                 "type": "text",   "options": [], "required": false, "position": 20, "sensitive": false},
    {"entity": "asset", "client_type": "deposito_gomme", "key": "stagione",      "label": "Stagione",              "type": "select", "options": ["Estiva","Invernale","4 stagioni"], "required": false, "position": 30, "sensitive": false},
    {"entity": "asset", "client_type": "deposito_gomme", "key": "posizione",     "label": "Posizione in magazzino","type": "text",   "options": [], "required": false, "position": 40, "sensitive": false},
    {"entity": "asset", "client_type": "deposito_gomme", "key": "data_ingresso", "label": "Data ingresso",         "type": "date",   "options": [], "required": false, "position": 50, "sensitive": false},
    {"entity": "asset", "client_type": "deposito_gomme", "key": "battistrada",   "label": "Stato battistrada",     "type": "select", "options": ["Buono","Discreto","Da sostituire"], "required": false, "position": 60, "sensitive": false},

    {"entity": "item", "client_type": "pneumatici", "key": "larghezza",       "label": "Larghezza",                 "type": "number", "options": [], "required": false, "position": 10,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "serie",           "label": "Serie",                     "type": "number", "options": [], "required": false, "position": 20,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "diametro",        "label": "Diametro",                  "type": "number", "options": [], "required": false, "position": 30,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "indice_carico",   "label": "Indice di carico",          "type": "text",   "options": [], "required": false, "position": 40,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "codice_velocita", "label": "Codice di velocità",        "type": "text",   "options": [], "required": false, "position": 50,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "stagione",        "label": "Stagione",                  "type": "select", "options": ["Estiva","Invernale","4 stagioni"], "required": false, "position": 60, "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "marca",           "label": "Marca",                     "type": "text",   "options": [], "required": false, "position": 70,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "modello",         "label": "Modello",                   "type": "text",   "options": [], "required": false, "position": 80,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "classe_consumo",  "label": "Classe consumo",            "type": "text",   "options": [], "required": false, "position": 90,  "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "classe_bagnato",  "label": "Aderenza sul bagnato",      "type": "text",   "options": [], "required": false, "position": 100, "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "classe_rumore",   "label": "Rumore",                    "type": "text",   "options": [], "required": false, "position": 110, "sensitive": false},
    {"entity": "item", "client_type": "pneumatici", "key": "numero_eprel",    "label": "Numero registrazione EPREL","type": "text",   "options": [], "required": false, "position": 120, "sensitive": false}
  ]
}$json$::jsonb);

-- ----------------------------------------------------------------------------
-- 4. apply_vertical_template: come 20261023120000 + lot_label (idempotente).
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

  INSERT INTO public.inventory_item_types
    (company_id, key, label, lot_label, track_lot, track_expiry, track_serial, consumable,
     fractional, sellable, requires_client_on_issue, position)
  SELECT p_company_id, i.key, i.label, i.lot_label, i.track_lot, i.track_expiry, i.track_serial, i.consumable,
         i.fractional, i.sellable, i.requires_client_on_issue, i.position
  FROM jsonb_to_recordset(coalesce(v_tpl.payload -> 'item_types', '[]'::jsonb)) AS i(
    key TEXT, label TEXT, lot_label TEXT, track_lot BOOLEAN, track_expiry BOOLEAN, track_serial BOOLEAN,
    consumable BOOLEAN, fractional BOOLEAN, sellable BOOLEAN, requires_client_on_issue BOOLEAN,
    position INTEGER)
  ON CONFLICT (company_id, key) DO NOTHING;

  RETURN v_tpl.version;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
