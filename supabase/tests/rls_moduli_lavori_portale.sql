-- ============================================================================
-- Test RLS e RPC di docs/MODULI_LAVORI_PORTALE.md §9.
-- Esecuzione (migration applicate, utente postgres): editor SQL di Supabase, MCP execute_sql o psql:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_moduli_lavori_portale.sql
-- Tutto in una transazione con ROLLBACK finale: nessun dato resta nel DB.
-- Ogni verifica solleva eccezione (ASSERT FALLITO) in caso di errore.
-- Storage (bucket client-documents) non coperto: richiede lo schema storage.
-- ============================================================================

BEGIN;

-- Helper temporanei (rollback finale): asserzioni e attese di errore.
CREATE OR REPLACE FUNCTION public.tmp_assert(p_ok BOOLEAN, p_msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERT FALLITO: %', p_msg USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tmp_expect_error(p_sql TEXT, p_sqlstate TEXT, p_label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'ASSERT FALLITO: "%" doveva fallire con SQLSTATE %', p_label, p_sqlstate
    USING ERRCODE = 'P0001';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = p_sqlstate THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'ASSERT FALLITO: "%" ha dato SQLSTATE % invece di %: %',
    p_label, SQLSTATE, p_sqlstate, SQLERRM USING ERRCODE = 'P0001';
END $$;

-- ----------------------------------------------------------------------------
-- Dati di prova (come postgres, bypass RLS)
--   S1 gommista (portale on), S2 officina (portale acceso nel test), S3 generico (portale off)
--   Utenti: owner/member/officina(ruolo)/accountant di S1; cliente A e B di S1;
--           outsider (nessun link); owner S2 + cliente S2; owner S3.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner1@example.test'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member1@example.test'),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'officina1@example.test'),
  ('30000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'account1@example.test'),
  ('30000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cust_a@example.test'),
  ('30000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cust_b@example.test'),
  ('30000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.test'),
  ('30000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner2@example.test'),
  ('30000000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cust_s2@example.test'),
  ('30000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner3@example.test');

INSERT INTO public.companies (id, name, slug) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Gomme Test', 'test-gomme-s1'),
  ('10000000-0000-4000-8000-000000000002', 'Officina Test', 'test-officina-s2'),
  ('10000000-0000-4000-8000-000000000003', 'Generico Test', 'test-generico-s3');

SELECT public.apply_vertical_template('10000000-0000-4000-8000-000000000001', 'gommista');
SELECT public.apply_vertical_template('10000000-0000-4000-8000-000000000002', 'officina');
SELECT public.apply_vertical_template('10000000-0000-4000-8000-000000000003', 'generico');

-- Verifiche di preset e moduli (prima di accendere il portale di S2).
SELECT public.tmp_assert(
  NOT public.module_enabled('10000000-0000-4000-8000-000000000002', 'customer_portal'),
  'officina v2: portale spento di default');
SELECT public.tmp_assert(
  public.module_enabled('10000000-0000-4000-8000-000000000001', 'work_orders')
  AND public.module_enabled('10000000-0000-4000-8000-000000000001', 'customer_portal'),
  'gommista: work_orders e portale accesi');
SELECT public.tmp_assert(
  NOT public.module_enabled('10000000-0000-4000-8000-000000000003', 'work_orders'),
  'modulo nuovo assente = spento (studio generico)');
SELECT public.tmp_assert(
  public.permission_module('work_orders:read') = 'work_orders'
  AND public.permission_module('requests:write') = 'requests'
  AND public.permission_module('recalls:manage') = 'recalls',
  'permission_module dei nuovi permessi');
SELECT public.tmp_assert(
  'work_orders:write' = ANY (public.system_role_permissions('member'))
  AND NOT ('work_orders:write' = ANY (public.system_role_permissions('accountant'))),
  'member ha work_orders, accountant no');

SELECT public.tmp_expect_error(
  $q$INSERT INTO public.company_modules (company_id, module, enabled)
     VALUES ('10000000-0000-4000-8000-000000000003', 'bogus', true)$q$,
  '23514', 'CHECK modulo sconosciuto');

-- Accensione del portale dello studio S2 e id fissi per i servizi di S1 (per i test).
UPDATE public.company_modules SET enabled = true
WHERE company_id = '10000000-0000-4000-8000-000000000002' AND module = 'customer_portal';
UPDATE public.service_catalog SET id = 'a0000000-0000-4000-8000-000000000001'
WHERE company_id = '10000000-0000-4000-8000-000000000001' AND key = 'montaggio';
UPDATE public.service_catalog SET id = 'a0000000-0000-4000-8000-000000000002'
WHERE company_id = '10000000-0000-4000-8000-000000000001' AND key = 'convergenza';

INSERT INTO public.clients (id, company_id, code, name, client_type, phone, email) VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'PT-TEST-0001', 'Cliente A', 'gommista', '3330000001', 'a@example.test'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'PT-TEST-0002', 'Cliente B', 'gommista', '3330000002', 'b@example.test'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'PT-TEST-0003', 'Non collegato', 'gommista', '3330000003', ''),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'PT-TEST-0004', 'Cliente S2', 'officina', '3330000004', ''),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 'PT-TEST-0005', 'Cliente S3', 'generico', '3330000005', '');

INSERT INTO public.client_accounts (user_id, company_id, client_id) VALUES
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004');

INSERT INTO public.company_members (company_id, user_id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'member'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'accountant'),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', 'owner'),
  ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-00000000000a', 'owner');
INSERT INTO public.company_members (company_id, user_id, role, custom_role_id) VALUES
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'member',
   (SELECT r.id FROM public.company_roles r
    WHERE r.company_id = '10000000-0000-4000-8000-000000000001' AND r.key = 'officina'));

INSERT INTO public.client_assets (id, company_id, client_id, asset_type, name, identifier, attributes) VALUES
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'veicolo', 'Golf', 'AB123CD', '{"targa":"AB123CD","marca":"VW"}'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'veicolo', 'Clio', 'ZZ999ZZ', '{"targa":"ZZ999ZZ","marca":"Renault"}');

INSERT INTO public.inventory_items (id, company_id, sku, name, item_type_id, sale_price, vat_rate, attributes) VALUES
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'PN-205-55-16', 'Pneumatico 205/55 R16',
   (SELECT t.id FROM public.inventory_item_types t WHERE t.company_id = '10000000-0000-4000-8000-000000000001' AND t.key = 'pneumatici'),
   100, 22, '{"larghezza":"205","serie":"55","diametro":"16","marca":"TestTyre"}'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'PN-185-60-15', 'Pneumatico 185/60 R15',
   (SELECT t.id FROM public.inventory_item_types t WHERE t.company_id = '10000000-0000-4000-8000-000000000001' AND t.key = 'pneumatici'),
   80, 22, '{"larghezza":"185","serie":"60","diametro":"15"}');

INSERT INTO public.inventory_movements (company_id, item_id, movement_type, quantity, lot) VALUES
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'carico', 10, 'DOT2026');

INSERT INTO public.quotes (id, company_id, client, quote_type, status, amount, description, client_id) VALUES
  ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Cliente B', 'Pneumatici', 'quote_sent', 50, 'Test', '40000000-0000-4000-8000-000000000002');

INSERT INTO public.calendar_events (id, company_id, title, start_at, end_at, client_id) VALUES
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Cambio gomme', now(), now() + interval '1 hour', '40000000-0000-4000-8000-000000000001');

-- Ordini: l'inserimento genera la notifica 'waiting' per i clienti collegati.
INSERT INTO public.work_orders (id, company_id, client_id, asset_id, title) VALUES
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Cambio gomme'),
  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Tagliando'),
  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', NULL, 'Revisione S2');

-- Coerenza dati: trigger di notifica e FK composite.
SELECT public.tmp_assert(
  (SELECT count(*) FROM public.customer_notifications
   WHERE client_id = '40000000-0000-4000-8000-000000000002') = 1,
  'notifica waiting creata per il cliente B collegato');
SELECT public.tmp_expect_error(
  $q$INSERT INTO public.quotes (company_id, client, client_id)
     VALUES ('10000000-0000-4000-8000-000000000002', 'x', '40000000-0000-4000-8000-000000000001')$q$,
  '23503', 'FK composita: cliente di altro studio');
SELECT public.tmp_expect_error(
  $q$INSERT INTO public.client_accounts (user_id, company_id, client_id)
     VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003')$q$,
  '42501', 'staff non può essere cliente del proprio studio');
SELECT public.tmp_expect_error(
  $q$INSERT INTO public.client_documents (company_id, client_id, kind, storage_path, mime_type, size_bytes)
     VALUES ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'libretto',
             'altro/percorso.pdf', 'application/pdf', 10)$q$,
  '23514', 'percorso documento fuori dal prefisso cliente');

-- ----------------------------------------------------------------------------
-- Owner S1
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 2, 'owner S1 vede i 2 ordini dello studio');
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders WHERE company_id = '10000000-0000-4000-8000-000000000002') = 0,
  'owner S1 non vede ordini di S2');
SELECT public.tmp_assert((SELECT count(*) FROM public.service_catalog WHERE key = 'montaggio') = 1,
  'owner vede il servizio non pubblico');
SELECT public.tmp_assert((SELECT count(*) FROM public.client_accounts) = 2, 'owner vede i 2 link dello studio');

INSERT INTO public.work_orders (id, company_id, client_id, title) VALUES
  ('90000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'Ordine di test');
DELETE FROM public.work_orders WHERE id = '90000000-0000-4000-8000-000000000004';
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders WHERE id = '90000000-0000-4000-8000-000000000004') = 0,
  'owner crea e cancella un ordine (records:manage)');

UPDATE public.work_orders SET status = 'in_progress' WHERE id = '90000000-0000-4000-8000-000000000001';
SELECT public.tmp_assert((SELECT started_at IS NOT NULL FROM public.work_orders WHERE id = '90000000-0000-4000-8000-000000000001'),
  'started_at al primo in_progress');
UPDATE public.work_orders SET status = 'ready' WHERE id = '90000000-0000-4000-8000-000000000001';
UPDATE public.work_orders SET ready_at = '2000-01-01' WHERE id = '90000000-0000-4000-8000-000000000002';
SELECT public.tmp_assert((SELECT ready_at IS NULL FROM public.work_orders WHERE id = '90000000-0000-4000-8000-000000000002'),
  'timestamp non scrivibili direttamente');
SELECT public.tmp_assert((SELECT count(*) FROM public.work_order_events WHERE work_order_id = '90000000-0000-4000-8000-000000000001') = 3,
  'eventi: waiting + in_progress + ready');
SELECT public.tmp_expect_error($q$UPDATE public.work_order_events SET to_status = 'waiting'$q$, '42501', 'eventi non modificabili');
SELECT public.tmp_expect_error($q$DELETE FROM public.work_order_events$q$, '42501', 'eventi non cancellabili');
SELECT public.tmp_expect_error(
  $q$UPDATE public.work_orders SET company_id = '10000000-0000-4000-8000-000000000002'
     WHERE id = '90000000-0000-4000-8000-000000000001'$q$,
  '42501', 'company_id immutabile');

-- Notifica di stato con il titolo dei termini dello studio (gommista).
SELECT public.tmp_assert(
  (SELECT count(*) FROM public.customer_notifications
   WHERE dedupe_key = 'work_order:90000000-0000-4000-8000-000000000001:ready'
     AND title = 'Auto pronta al ritiro!') = 1,
  'titolo notifica "ready" dai termini dello studio');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Member S1 (nessun records:manage, nessun recalls: ha recalls:manage)
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 2, 'member vede gli ordini dello studio');
DELETE FROM public.work_orders WHERE id = '90000000-0000-4000-8000-000000000002';
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders WHERE id = '90000000-0000-4000-8000-000000000002') = 1,
  'member non cancella ordini (manca records:manage)');
SELECT public.tmp_expect_error(
  $q$INSERT INTO public.recall_log (company_id, client_id, kind, period_key, channel, sent_by)
     VALUES ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'stagionale', '2026-11', 'whatsapp', '30000000-0000-4000-8000-000000000001')$q$,
  '42501', 'recall a nome altrui');
INSERT INTO public.recall_log (company_id, client_id, kind, period_key, channel, sent_by) VALUES
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'stagionale', '2026-11', 'whatsapp', '30000000-0000-4000-8000-000000000002');
SELECT public.tmp_expect_error(
  $q$INSERT INTO public.recall_log (company_id, client_id, kind, period_key, channel, sent_by)
     VALUES ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'stagionale', '2026-11', 'whatsapp', '30000000-0000-4000-8000-000000000002')$q$,
  '23505', 'recall duplicato');
SELECT public.tmp_expect_error(
  $q$SELECT public.register_customer('10000000-0000-4000-8000-000000000001', 'Staff', 'Test', '3331230000')$q$,
  '42501', 'membro dello studio non si registra come cliente');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Officina (ruolo personalizzato: work_orders + clients:read + calendar:read)
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 2, 'ruolo officina vede gli ordini');
SELECT public.tmp_assert((SELECT count(*) FROM public.clients WHERE company_id = '10000000-0000-4000-8000-000000000001') = 3,
  'ruolo officina vede le schede (clients:read)');
SELECT public.tmp_assert((SELECT count(*) FROM public.quotes) = 0, 'ruolo officina non vede i preventivi');
SELECT public.tmp_assert((SELECT count(*) FROM public.recall_log) = 0, 'ruolo officina non vede i recall');
SELECT public.tmp_assert(NOT public.has_permission('10000000-0000-4000-8000-000000000001', 'requests:read'),
  'ruolo officina senza requests:read');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Accountant S1
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 0, 'accountant non vede gli ordini');
SELECT public.tmp_assert((SELECT count(*) FROM public.quotes) = 1, 'accountant vede i preventivi (quotes:read)');
SELECT public.tmp_expect_error(
  $q$SELECT public.revoke_client_account('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002')$q$,
  '42501', 'accountant non revoca accessi (manca clients:write)');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Outsider (nessun link): nessuna visibilità e nessuna RPC cliente
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.service_catalog WHERE company_id = '10000000-0000-4000-8000-000000000001') = 0,
  'outsider non vede il listino di S1');
SELECT public.tmp_expect_error(
  $q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'Panda', 'X1', '{"targa":"X1"}')$q$,
  '42501', 'RPC cliente senza link');
SELECT public.register_customer('10000000-0000-4000-8000-000000000001', 'Mario', 'Rossi', '3331234567');
SELECT public.tmp_assert((SELECT count(*) FROM public.client_accounts WHERE user_id = '30000000-0000-4000-8000-000000000007') = 1,
  'registrazione crea il link');
SELECT public.tmp_expect_error(
  $q$SELECT public.register_customer('10000000-0000-4000-8000-000000000001', 'Mario', 'Rossi', '3331234567')$q$,
  '23505', 'registrazione doppia');
SELECT public.tmp_expect_error(
  $q$SELECT public.register_customer('10000000-0000-4000-8000-000000000003', 'Mario', 'Rossi', '3331234567')$q$,
  '42501', 'registrazione in studio con portale spento');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Cliente A (solo i propri dati)
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.clients) = 1, 'cliente A vede solo la propria scheda');
SELECT public.tmp_assert((SELECT count(*) FROM public.client_assets) = 1, 'cliente A vede solo i propri beni');
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 1, 'cliente A vede solo i propri ordini');
SELECT public.tmp_assert((SELECT count(*) FROM public.calendar_events) = 1, 'cliente A vede i propri appuntamenti');
SELECT public.tmp_assert((SELECT count(*) FROM public.quotes) = 0, 'cliente A non vede il preventivo di B');
SELECT public.tmp_assert((SELECT count(*) FROM public.customer_notifications
                          WHERE client_id = '40000000-0000-4000-8000-000000000002') = 0,
  'cliente A non vede le notifiche di B');
SELECT public.tmp_assert((SELECT count(*) FROM public.customer_notifications) >= 1, 'cliente A vede le proprie notifiche');
SELECT public.tmp_assert((SELECT count(*) FROM public.service_catalog WHERE key = 'montaggio') = 0,
  'cliente non vede il servizio non pubblico');
SELECT public.tmp_assert((SELECT count(*) FROM public.service_catalog) = 4, 'cliente vede i 4 servizi pubblici attivi');
SELECT public.tmp_expect_error($q$INSERT INTO public.work_orders (company_id, client_id, title)
  VALUES ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'hack')$q$,
  '42501', 'cliente non crea ordini');
SELECT public.tmp_expect_error($q$INSERT INTO public.service_requests (company_id, client_id, kind)
  VALUES ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'info')$q$,
  '42501', 'cliente non inserisce richieste direttamente');

-- Beni
SELECT public.tmp_expect_error($q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'Panda', NULL, '{"marca":"Fiat"}')$q$,
  '22023', 'targa obbligatoria');
SELECT public.tmp_expect_error($q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'Panda', NULL, '{"targa":"ZZ111YY","segreto":"x"}')$q$,
  '22023', 'campo non previsto');
SELECT public.tmp_expect_error($q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'aereo', 'Aereo', NULL, '{}')$q$,
  '22023', 'tipo di bene non previsto');
SELECT set_config('test.new_asset', (public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'Panda', ' zz111yy ',
  '{"targa":"ZZ111YY","marca":"Fiat"}'))::text, true);
SELECT public.tmp_assert((SELECT identifier FROM public.client_assets WHERE id = current_setting('test.new_asset')::uuid) = 'ZZ111YY',
  'identificatore normalizzato (trim, maiuscolo)');
SELECT public.tmp_expect_error($q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'Panda 2', 'zz111yy',
  '{"targa":"ZZ111YY"}')$q$, '23505', 'identificatore duplicato nello studio');
SELECT public.customer_update_asset('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '{"km": 52000}');
SELECT public.tmp_assert((SELECT attributes ->> 'km' FROM public.client_assets WHERE id = '50000000-0000-4000-8000-000000000001') = '52000',
  'aggiornamento attributi del proprio bene');
SELECT public.tmp_expect_error($q$SELECT public.customer_update_asset('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '{"segreto":1}')$q$,
  '22023', 'chiave non prevista in aggiornamento');
SELECT public.tmp_expect_error($q$SELECT public.customer_update_asset('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '{"km":1}')$q$,
  '42501', 'bene di un altro cliente');

-- Documenti
SELECT public.tmp_expect_error($q$SELECT public.customer_add_document('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
  'libretto', '10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002/x.pdf', 'application/pdf', 1000)$q$,
  '42501', 'documento con percorso di un altro cliente');
SELECT public.tmp_expect_error($q$SELECT public.customer_add_document('10000000-0000-4000-8000-000000000001', NULL,
  'libretto', '10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/x.html', 'text/html', 1000)$q$,
  '22023', 'mime non ammesso');
SELECT public.customer_add_document('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
  'libretto', '10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/libretto-1.pdf',
  'application/pdf', 1000);
SELECT public.tmp_assert((SELECT count(*) FROM public.client_documents) = 1, 'cliente A vede il proprio documento');

-- Richieste e preventivo automatico (il prezzo viene dal DB, mai dal client)
SELECT set_config('test.req_conv', (public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'service', 'a0000000-0000-4000-8000-000000000002', NULL, 'Vorrei la convergenza', NULL))::text, true);
SELECT public.tmp_assert((SELECT status = 'new' AND (auto_quote ->> 'available') = 'false'
                          FROM public.service_requests WHERE id = current_setting('test.req_conv')::uuid),
  'servizio senza prezzo: su richiesta, status new');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'service', 'a0000000-0000-4000-8000-000000000001', NULL, NULL, NULL)$q$,
  '22023', 'servizio non pubblico non richiedibile');
SELECT set_config('test.req_zero', (public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'inventory', '60000000-0000-4000-8000-000000000002', 2, NULL, NULL))::text, true);
SELECT public.tmp_assert((SELECT status FROM public.service_requests WHERE id = current_setting('test.req_zero')::uuid) = 'new',
  'articolo senza giacenza: status new');
SELECT set_config('test.req_nomont', (public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'inventory', '60000000-0000-4000-8000-000000000001', 2, NULL, NULL))::text, true);
SELECT public.tmp_assert((SELECT status FROM public.service_requests WHERE id = current_setting('test.req_nomont')::uuid) = 'new',
  'montaggio senza prezzo: articolo non disponibile automaticamente');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'inventory', '60000000-0000-4000-8000-000000000001', 0, NULL, NULL)$q$,
  '22023', 'quantità non valida');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  NULL, NULL, NULL, repeat('x', 1001), NULL)$q$,
  '22023', 'messaggio troppo lungo');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  NULL, NULL, NULL, NULL, DATE '2020-01-01')$q$,
  '22023', 'data passata');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote',
  '50000000-0000-4000-8000-000000000002', NULL, NULL, NULL, NULL, NULL)$q$,
  '42501', 'bene di un altro cliente in richiesta');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'foo', NULL,
  NULL, NULL, NULL, NULL, NULL)$q$,
  '22023', 'tipo richiesta non valido');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'hack', '60000000-0000-4000-8000-000000000001', NULL, NULL, NULL)$q$,
  '22023', 'sorgente articolo non valida');
RESET ROLE;

-- Prezzo del montaggio impostato dallo studio: ora l'articolo è disponibile.
UPDATE public.service_catalog SET price = 15 WHERE id = 'a0000000-0000-4000-8000-000000000001';

SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT set_config('test.req_auto', (public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'inventory', '60000000-0000-4000-8000-000000000001', 2, NULL, NULL))::text, true);
SELECT public.tmp_assert((SELECT status = 'auto_quoted'
                             AND (auto_quote ->> 'total')::NUMERIC = 215
                             AND (auto_quote ->> 'addonPrice')::NUMERIC = 15
                             AND (item ->> 'price')::NUMERIC = 100
                          FROM public.service_requests WHERE id = current_setting('test.req_auto')::uuid),
  'preventivo automatico: 2 x 100 + montaggio 15 = 215, status auto_quoted');
SELECT public.tmp_assert((SELECT count(*) FROM public.quotes WHERE request_id = current_setting('test.req_auto')::uuid) = 0,
  'auto_quote disattivato: nessun preventivo emesso');
RESET ROLE;

-- Preventivo automatico attivo per lo studio.
UPDATE public.companies SET custom_metadata = custom_metadata || '{"auto_quote": true}'::jsonb
WHERE id = '10000000-0000-4000-8000-000000000001';

SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT set_config('test.req_flag', (public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL,
  'inventory', '60000000-0000-4000-8000-000000000001', 1, NULL, NULL))::text, true);
SELECT public.tmp_assert((SELECT status = 'quoted' AND quote_id IS NOT NULL
                          FROM public.service_requests WHERE id = current_setting('test.req_flag')::uuid),
  'auto_quote attivo: richiesta quoted con preventivo');
SELECT public.tmp_assert((SELECT amount FROM public.quotes
                          WHERE id = (SELECT quote_id FROM public.service_requests WHERE id = current_setting('test.req_flag')::uuid)) = 115
                         AND (SELECT status FROM public.quotes
                              WHERE id = (SELECT quote_id FROM public.service_requests WHERE id = current_setting('test.req_flag')::uuid)) = 'quote_sent',
  'preventivo: 1 x 100 + montaggio 15 = 115, quote_sent');
SELECT set_config('test.req_flag_quote', (SELECT quote_id FROM public.service_requests WHERE id = current_setting('test.req_flag')::uuid)::text, true);
SELECT public.customer_respond_quote('10000000-0000-4000-8000-000000000001', current_setting('test.req_flag_quote')::uuid, 'approved');
SELECT public.tmp_assert((SELECT status = 'approved' FROM public.quotes WHERE id = current_setting('test.req_flag_quote')::uuid),
  'cliente approva il proprio preventivo');
SELECT public.tmp_expect_error(
  format($q$SELECT public.customer_respond_quote('10000000-0000-4000-8000-000000000001', %L::uuid, 'declined')$q$, current_setting('test.req_flag_quote')),
  '42501', 'preventivo già risposto');
SELECT public.tmp_expect_error(
  $q$SELECT public.customer_respond_quote('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'approved')$q$,
  '42501', 'preventivo di un altro cliente');
SELECT public.tmp_expect_error(
  $q$SELECT public.customer_respond_quote('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'maybe')$q$,
  '22023', 'decisione non valida');
SELECT public.tmp_assert((SELECT count(*) FROM public.service_requests) = 5,
  'cliente A vede le proprie 5 richieste');
RESET ROLE;

-- Notifica di B: A non può segnarla come letta.
SELECT set_config('test.notif_b', (SELECT id FROM public.customer_notifications WHERE client_id = '40000000-0000-4000-8000-000000000002' LIMIT 1)::text, true);
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert(public.customer_mark_notifications_read('10000000-0000-4000-8000-000000000001',
  ARRAY[current_setting('test.notif_b')::uuid]) = 0, 'notifica di un altro cliente: nessuna modifica');
SELECT public.tmp_assert(public.customer_mark_notifications_read('10000000-0000-4000-8000-000000000001',
  ARRAY(SELECT n.id FROM public.customer_notifications n)) >= 1, 'cliente A segna le proprie come lette');
-- Cliente A non modifica le richieste direttamente (nessuna policy di update).
UPDATE public.service_requests SET status = 'closed' WHERE id = current_setting('test.req_conv')::uuid;
SELECT public.tmp_assert((SELECT count(*) FROM public.service_requests WHERE status = 'closed') = 0,
  'cliente non modifica le proprie richieste');
RESET ROLE;

-- Staff: vede richieste e documenti del cliente.
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.service_requests) = 5, 'owner vede le richieste dello studio');
SELECT public.tmp_assert((SELECT count(*) FROM public.client_documents) = 1, 'owner vede i documenti dello studio');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.service_requests) = 0,
  'ruolo officina non vede le richieste (manca requests:read)');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Cliente B: isolamento dai dati di A
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 1, 'cliente B vede solo il proprio ordine');
SELECT public.tmp_assert((SELECT count(*) FROM public.client_assets) = 1, 'cliente B vede solo il proprio bene');
SELECT public.tmp_assert((SELECT count(*) FROM public.quotes) = 1, 'cliente B vede il proprio preventivo');
SELECT public.tmp_assert((SELECT count(*) FROM public.client_documents) = 0, 'cliente B non vede i documenti di A');
SELECT public.tmp_assert((SELECT count(*) FROM public.service_requests) = 0, 'cliente B non vede richieste di A');
SELECT public.tmp_expect_error($q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'Clio 2', 'zz111yy',
  '{"targa":"ZZ111YY"}')$q$, '23505', 'targa già registrata da un altro cliente dello studio');
SELECT public.tmp_expect_error($q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote',
  '50000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, NULL)$q$,
  '42501', 'richiesta per il bene di A');
SELECT public.customer_respond_quote('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'declined');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Anon: nessuna tabella; solo anteprima e catalogo dello studio con portale attivo
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);
SET ROLE anon;
SELECT public.tmp_expect_error($q$SELECT count(*) FROM public.work_orders$q$, '42501', 'anon non legge gli ordini');
SELECT public.tmp_expect_error($q$SELECT count(*) FROM public.client_accounts$q$, '42501', 'anon non legge i link');
SELECT public.tmp_expect_error(
  $q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'quote', NULL, NULL, NULL, NULL, NULL, NULL)$q$,
  '42501', 'anon non crea richieste');
SELECT public.tmp_assert((SELECT count(*) FROM public.get_portal_company('test-gomme-s1')) = 1,
  'anon vede lo studio con portale attivo');
SELECT public.tmp_assert((SELECT count(*) FROM public.get_portal_company('test-generico-s3')) = 0,
  'anon non vede lo studio con portale spento');
SELECT public.tmp_assert((SELECT count(*) FROM public.get_public_catalog('10000000-0000-4000-8000-000000000001') WHERE kind = 'service') = 4,
  'catalogo pubblico: 4 servizi');
SELECT public.tmp_assert((SELECT count(*) FROM public.get_public_catalog('10000000-0000-4000-8000-000000000001') WHERE kind = 'item') = 1,
  'catalogo pubblico: solo l articolo con giacenza');
SELECT public.tmp_assert((SELECT count(*) FROM public.get_public_catalog('10000000-0000-4000-8000-000000000003')) = 0,
  'catalogo pubblico vuoto per portale spento');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Cliente di S2 e owner di S2 / S3: isolamento tra studi, moduli spenti
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 1, 'cliente S2 vede solo gli ordini di S2');
SELECT public.tmp_expect_error($q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'X', 'Y1', '{"targa":"Y1"}')$q$,
  '42501', 'cliente S2 non agisce su S1');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_expect_error(
  $q$INSERT INTO public.work_orders (company_id, client_id, title)
     VALUES ('10000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000005', 'x')$q$,
  '42501', 'owner di studio senza work_orders non crea ordini');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Revoca dell'accesso: il cliente B perde la visibilità e le RPC
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.revoke_client_account('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002');
SELECT public.tmp_expect_error(
  $q$SELECT public.revoke_client_account('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002')$q$,
  'P0002', 'revoca senza accesso attivo');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 0, 'cliente B revocato non vede gli ordini');
SELECT public.tmp_expect_error($q$SELECT public.customer_add_asset('10000000-0000-4000-8000-000000000001', 'veicolo', 'Clio 3', 'NEW1', '{"targa":"NEW1"}')$q$,
  '42501', 'cliente revocato non aggiunge beni');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Portale spento su S1: il cliente A perde accesso; ordini spenti per lo staff
-- ----------------------------------------------------------------------------
UPDATE public.company_modules SET enabled = false
WHERE company_id = '10000000-0000-4000-8000-000000000001' AND module = 'customer_portal';

SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 0, 'portale spento: il cliente non vede i dati');
SELECT public.tmp_expect_error(
  $q$SELECT public.customer_create_request('10000000-0000-4000-8000-000000000001', 'info', NULL, NULL, NULL, NULL, 'ciao', NULL)$q$,
  '42501', 'portale spento: richiesta negata');
RESET ROLE;

UPDATE public.company_modules SET enabled = false
WHERE company_id = '10000000-0000-4000-8000-000000000001' AND module = 'work_orders';

SELECT set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT public.tmp_assert((SELECT count(*) FROM public.work_orders) = 0, 'modulo work_orders spento: owner non vede gli ordini');
RESET ROLE;

SELECT 'OK: tutti i test di rls_moduli_lavori_portale sono passati';

ROLLBACK;
