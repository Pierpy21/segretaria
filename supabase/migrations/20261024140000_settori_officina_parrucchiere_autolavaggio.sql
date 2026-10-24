-- ============================================================================
-- Migration: settori officina, parrucchiere, autolavaggio
-- Description:
--   1. companies_sector_check += 'officina', 'parrucchiere', 'autolavaggio'.
--   2. vertical_templates: preset 'officina', 'parrucchiere', 'autolavaggio' v1
--      (unica aggiunta; gli altri preset restano invariati).
-- Depends on: 20261024130000_company_members_management.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Settori
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies DROP CONSTRAINT companies_sector_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_sector_check
  CHECK (sector IN (
    'dentale', 'medico', 'commercialista', 'legale', 'estetico', 'gommista', 'generico',
    'officina', 'parrucchiere', 'autolavaggio'
  ));

-- ----------------------------------------------------------------------------
-- 2. Preset v1
--    Beni del cliente: entity 'asset', client_type = asset_type ('veicolo').
--    Campi articolo: entity 'item', client_type = chiave del tipo articolo.
-- ----------------------------------------------------------------------------
INSERT INTO public.vertical_templates (key, version, label, description, payload) VALUES
('officina', 1, 'Officina meccanica', 'Clienti, veicoli, interventi, ricambi e magazzino', $json${
  "terms": {
    "clientSingular": "Cliente", "clientPlural": "Clienti",
    "quoteSingular": "Preventivo", "quotePlural": "Preventivi",
    "ownerTitle": "Titolare", "memberTitle": "Meccanico", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati riservati", "tasksLabel": "Lavorazioni",
    "clientsSubtitle": "Anagrafica clienti, veicoli e storico degli interventi",
    "chatSubtitle": "Richieste dei clienti, promemoria tagliandi e messaggistica",
    "agendaSubtitle": "Interventi in officina sincronizzati con Google/Apple",
    "tasksSubtitle": "Kanban delle lavorazioni in officina",
    "quotesSubtitle": "Preventivi per interventi e ricambi",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al cliente",
    "statusApproved": "Accettato dal cliente", "statusDeclined": "Non accettato",
    "inventoryLabel": "Magazzino ricambi", "itemSingular": "Articolo", "itemPlural": "Articoli",
    "inventorySubtitle": "Ricambi, lubrificanti e materiali di consumo con giacenze"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": false, "assets": true, "ai_assistant": true, "inventory": true},
  "appointment_types": [
    {"key": "tagliando",   "label": "Tagliando",   "color": "#3B82F6", "duration_minutes": 60, "position": 10},
    {"key": "diagnosi",    "label": "Diagnosi",    "color": "#8B5CF6", "duration_minutes": 30, "position": 20},
    {"key": "riparazione", "label": "Riparazione", "color": "#EF4444", "duration_minutes": 120, "position": 30},
    {"key": "cambio_olio", "label": "Cambio olio", "color": "#10B981", "duration_minutes": 30, "position": 40},
    {"key": "revisione",   "label": "Revisione",   "color": "#F59E0B", "duration_minutes": 60, "position": 50},
    {"key": "freni",       "label": "Freni",       "color": "#F97316", "duration_minutes": 90, "position": 60}
  ],
  "item_types": [
    {"key": "ricambi",             "label": "Ricambi",             "lot_label": null, "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": false, "sellable": true,  "requires_client_on_issue": false, "position": 10},
    {"key": "lubrificanti",        "label": "Lubrificanti",        "lot_label": null, "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": true,  "sellable": false, "requires_client_on_issue": false, "position": 20},
    {"key": "materiali_consumo",   "label": "Materiali di consumo","lot_label": null, "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": false, "position": 30}
  ],
  "fields": [
    {"entity": "client", "client_type": "officina", "key": "referral_source", "label": "Come ci ha conosciuto", "type": "select", "options": ["Passaparola","Web","Social","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "officina", "key": "privacy_consent", "label": "Consenso privacy",      "type": "bool",   "options": [], "required": true,  "position": 20, "sensitive": false},

    {"entity": "asset", "client_type": "veicolo", "key": "targa",        "label": "Targa",             "type": "text",   "options": [], "required": true,  "position": 10, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "marca",        "label": "Marca",             "type": "text",   "options": [], "required": false, "position": 20, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "modello",      "label": "Modello",           "type": "text",   "options": [], "required": false, "position": 30, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "anno",         "label": "Anno",              "type": "number", "options": [], "required": false, "position": 40, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "km",           "label": "Km",                "type": "number", "options": [], "required": false, "position": 50, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "telaio",       "label": "Numero telaio",     "type": "text",   "options": [], "required": false, "position": 60, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "alimentazione","label": "Alimentazione",     "type": "select", "options": ["Benzina","Diesel","GPL","Metano","Ibrida","Elettrica"], "required": false, "position": 70, "sensitive": false}
  ]
}$json$::jsonb),
('parrucchiere', 1, 'Parrucchiere', 'Clienti, servizi, schede colore e prodotti del salone', $json${
  "terms": {
    "clientSingular": "Cliente", "clientPlural": "Clienti",
    "quoteSingular": "Preventivo", "quotePlural": "Preventivi",
    "ownerTitle": "Titolare", "memberTitle": "Stilista", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati sensibili", "tasksLabel": "Attività del salone",
    "clientsSubtitle": "Anagrafica clienti, schede colore e preferenze",
    "chatSubtitle": "Prenotazioni, promemoria e messaggistica WhatsApp",
    "agendaSubtitle": "Appuntamenti del salone sincronizzati con Google/Apple",
    "tasksSubtitle": "Kanban operativo: ordini prodotti e manutenzione postazioni",
    "quotesSubtitle": "Preventivi per trattamenti e pacchetti",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al cliente",
    "statusApproved": "Accettato dal cliente", "statusDeclined": "Non accettato",
    "inventoryLabel": "Magazzino prodotti", "itemSingular": "Prodotto", "itemPlural": "Prodotti",
    "inventorySubtitle": "Prodotti tecnici e di rivendita con lotti, scadenze e giacenze"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": true, "assets": false, "ai_assistant": true, "inventory": true},
  "appointment_types": [
    {"key": "taglio",      "label": "Taglio",      "color": "#E04A95", "duration_minutes": 45,  "position": 10},
    {"key": "piega",       "label": "Piega",       "color": "#8B5CF6", "duration_minutes": 30,  "position": 20},
    {"key": "colore",      "label": "Colore",      "color": "#F59E0B", "duration_minutes": 90,  "position": 30},
    {"key": "meches",      "label": "Meches",      "color": "#F97316", "duration_minutes": 120, "position": 40},
    {"key": "trattamento", "label": "Trattamento", "color": "#10B981", "duration_minutes": 45,  "position": 50},
    {"key": "barba",       "label": "Barba",       "color": "#3B82F6", "duration_minutes": 30,  "position": 60}
  ],
  "item_types": [
    {"key": "prodotti_rivendita", "label": "Prodotti in rivendita", "lot_label": null,   "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": false, "sellable": true,  "requires_client_on_issue": false, "position": 10},
    {"key": "prodotti_tecnici",   "label": "Prodotti tecnici",      "lot_label": "Lotto", "track_lot": true,  "track_expiry": true,  "track_serial": false, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": false, "position": 20}
  ],
  "fields": [
    {"entity": "client", "client_type": "parrucchiere", "key": "referral_source", "label": "Come ci ha conosciuto", "type": "select", "options": ["Passaparola","Web","Social","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "parrucchiere", "key": "tipo_capelli",    "label": "Tipo di capelli",       "type": "select", "options": ["Lisci","Mossi","Ricci","Crespi"], "required": false, "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "parrucchiere", "key": "colore_abituale", "label": "Colore abituale",       "type": "text",   "options": [], "required": false, "position": 30, "sensitive": false},
    {"entity": "client", "client_type": "parrucchiere", "key": "privacy_consent", "label": "Consenso privacy",      "type": "bool",   "options": [], "required": true,  "position": 40, "sensitive": false},
    {"entity": "client", "client_type": "parrucchiere", "key": "allergie",        "label": "Allergie",              "type": "text",   "options": [], "required": false, "position": 50, "sensitive": true}
  ]
}$json$::jsonb),
('autolavaggio', 1, 'Autolavaggio', 'Clienti, veicoli, abbonamenti, lavaggi e magazzino prodotti', $json${
  "terms": {
    "clientSingular": "Cliente", "clientPlural": "Clienti",
    "quoteSingular": "Preventivo", "quotePlural": "Preventivi",
    "ownerTitle": "Titolare", "memberTitle": "Operatore", "accountantTitle": "Assistente contabile",
    "sensitiveData": "Dati riservati", "tasksLabel": "Attività",
    "clientsSubtitle": "Anagrafica clienti, veicoli e abbonamenti",
    "chatSubtitle": "Prenotazioni, promemoria e messaggistica WhatsApp",
    "agendaSubtitle": "Turni di lavaggio sincronizzati con Google/Apple",
    "tasksSubtitle": "Kanban delle attività operative del centro",
    "quotesSubtitle": "Preventivi per lavaggi, trattamenti e abbonamenti",
    "statusPendingAi": "Bozza AI in revisione", "statusSent": "Inviato al cliente",
    "statusApproved": "Accettato dal cliente", "statusDeclined": "Non accettato",
    "inventoryLabel": "Magazzino prodotti", "itemSingular": "Prodotto", "itemPlural": "Prodotti",
    "inventorySubtitle": "Prodotti per il lavaggio e accessori con giacenze"
  },
  "modules": {"agenda": true, "chat": true, "quotes": true, "maintenance": true, "sensitive_data": false, "assets": true, "ai_assistant": true, "inventory": true},
  "appointment_types": [
    {"key": "lavaggio_esterno",    "label": "Lavaggio esterno",    "color": "#3B82F6", "duration_minutes": 20,  "position": 10},
    {"key": "lavaggio_completo",   "label": "Lavaggio completo",   "color": "#10B981", "duration_minutes": 40,  "position": 20},
    {"key": "interni",             "label": "Pulizia interni",     "color": "#F59E0B", "duration_minutes": 45,  "position": 30},
    {"key": "igienizzazione",      "label": "Igienizzazione",      "color": "#8B5CF6", "duration_minutes": 30,  "position": 40},
    {"key": "lucidatura",          "label": "Lucidatura",          "color": "#EF4444", "duration_minutes": 120, "position": 50},
    {"key": "trattamento_ceramico","label": "Trattamento ceramico","color": "#E04A95", "duration_minutes": 240, "position": 60}
  ],
  "item_types": [
    {"key": "prodotti_lavaggio", "label": "Prodotti per il lavaggio", "lot_label": null, "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true,  "fractional": true,  "sellable": false, "requires_client_on_issue": false, "position": 10},
    {"key": "accessori",         "label": "Accessori",                "lot_label": null, "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": false, "fractional": false, "sellable": true,  "requires_client_on_issue": false, "position": 20}
  ],
  "fields": [
    {"entity": "client", "client_type": "autolavaggio", "key": "referral_source", "label": "Come ci ha conosciuto", "type": "select", "options": ["Passaparola","Web","Social","Altro"], "required": false, "position": 10, "sensitive": false},
    {"entity": "client", "client_type": "autolavaggio", "key": "abbonamento",     "label": "Abbonamento",           "type": "select", "options": ["Nessuno","Mensile","Annuale"], "required": false, "position": 20, "sensitive": false},
    {"entity": "client", "client_type": "autolavaggio", "key": "privacy_consent", "label": "Consenso privacy",      "type": "bool",   "options": [], "required": true,  "position": 30, "sensitive": false},

    {"entity": "asset", "client_type": "veicolo", "key": "targa",        "label": "Targa",        "type": "text",   "options": [], "required": true,  "position": 10, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "marca",        "label": "Marca",        "type": "text",   "options": [], "required": false, "position": 20, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "modello",      "label": "Modello",      "type": "text",   "options": [], "required": false, "position": 30, "sensitive": false},
    {"entity": "asset", "client_type": "veicolo", "key": "tipo_veicolo", "label": "Tipo veicolo", "type": "select", "options": ["Utilitaria","Berlina","SUV","Furgone","Moto"], "required": false, "position": 40, "sensitive": false}
  ]
}$json$::jsonb);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
