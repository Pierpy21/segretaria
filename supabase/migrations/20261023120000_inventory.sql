-- ============================================================================
-- Migration: inventory (modulo Magazzino, versione minima)
-- Description:
--   1. Modulo 'inventory' e permessi inventory:read / inventory:write
--      (permission_catalog, system_role_permissions, permission_module).
--      DEVE restare allineato a lib/auth/permissions.ts.
--   2. client_field_definitions.entity += 'item' (client_type = chiave del tipo articolo).
--   3. Tabelle: inventory_item_types (flag di comportamento), inventory_categories,
--      inventory_items, inventory_movements (append-only), inventory_stock (calcolata).
--   4. Trigger sui movimenti: validazione secondo i flag del tipo (lotto, scadenza,
--      matricola, cliente, giacenza) e aggiornamento della giacenza.
--   5. RLS con has_permission.
--   6. Preset v2 (vertical_templates): modulo inventory, item_types, termini;
--      apply_vertical_template copia anche gli item_types. Studi esistenti aggiornati.
-- Regole:
--   - La giacenza nasce SOLO dai movimenti: inventory_stock è scritta dal trigger,
--     gli utenti hanno solo SELECT. Correzioni = movimento 'rettifica'.
--   - quantity dei movimenti è nell'unità di scarico (issue_unit se l'articolo è
--     frazionabile, altrimenti unit): positiva in entrata, negativa in uscita.
--   - Errori di validazione: ERRCODE 23514 + CONSTRAINT 'inventory_movement_rules'
--     (o 'inventory_item_rules'); il messaggio è pensato per l'utente.
-- Depends on: 20261020160000_drop_dental_xray_columns.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Modulo e permessi
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
    'inventory:read', 'inventory:write',
    'reports:read', 'records:manage', 'settings:manage', 'members:manage'
  ]::TEXT[];
$$;

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
      'inventory:read', 'inventory:write',
      'reports:read'
    ]::TEXT[]
    WHEN 'accountant' THEN ARRAY[
      'clients:read', 'quotes:read', 'quotes:write',
      'payments:read', 'payments:write', 'inventory:read',
      'reports:read', 'records:manage'
    ]::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END;
$$;

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
    WHEN 'inventory' THEN 'inventory'
    ELSE NULL
  END;
$$;

ALTER TABLE public.company_modules DROP CONSTRAINT company_modules_module_check;
ALTER TABLE public.company_modules
  ADD CONSTRAINT company_modules_module_check CHECK (
    module IN ('agenda', 'chat', 'quotes', 'maintenance', 'sensitive_data', 'assets', 'ai_assistant', 'inventory')
  );

-- ----------------------------------------------------------------------------
-- 2. Campi personalizzati degli articoli (entity = 'item', client_type = chiave del tipo)
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_field_definitions DROP CONSTRAINT client_field_definitions_entity_check;
ALTER TABLE public.client_field_definitions
  ADD CONSTRAINT client_field_definitions_entity_check CHECK (entity IN ('client', 'asset', 'item'));

-- Vincoli di supporto per le FK composite (x_id, company_id) dei movimenti.
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_id_company_id_key UNIQUE (id, company_id);
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_id_company_id_key UNIQUE (id, company_id);

-- ----------------------------------------------------------------------------
-- 3a. inventory_item_types: comportamento dell'articolo come dati (flag)
-- ----------------------------------------------------------------------------
CREATE TABLE public.inventory_item_types (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key                      TEXT        NOT NULL,
  label                    TEXT        NOT NULL,
  track_lot                BOOLEAN     NOT NULL DEFAULT false,
  track_expiry             BOOLEAN     NOT NULL DEFAULT false,
  track_serial             BOOLEAN     NOT NULL DEFAULT false,
  -- false = bene durevole: non va a scorta minima.
  consumable               BOOLEAN     NOT NULL DEFAULT true,
  -- true = carico in unit, scarico in issue_unit (conversion_factor sull'articolo).
  fractional               BOOLEAN     NOT NULL DEFAULT false,
  -- true = prezzo di vendita e aliquota IVA obbligatori sull'articolo.
  sellable                 BOOLEAN     NOT NULL DEFAULT false,
  -- true = ogni scarico indica il cliente (tracciabilità impianti/presidi).
  requires_client_on_issue BOOLEAN     NOT NULL DEFAULT false,
  position                 INTEGER     NOT NULL DEFAULT 0,
  archived_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT inventory_item_types_key_unique UNIQUE (company_id, key),
  CONSTRAINT inventory_item_types_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT inventory_item_types_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT inventory_item_types_label_length CHECK (char_length(label) BETWEEN 1 AND 80)
);

CREATE INDEX idx_inventory_item_types_company ON public.inventory_item_types(company_id, position);

CREATE TRIGGER trg_inventory_item_types_updated_at
  BEFORE UPDATE ON public.inventory_item_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_inventory_item_types_immutable_company_id
  BEFORE UPDATE ON public.inventory_item_types
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 3b. inventory_categories: solo organizzazione e filtri
-- ----------------------------------------------------------------------------
CREATE TABLE public.inventory_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  parent_id   UUID,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT inventory_categories_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT inventory_categories_parent_fkey FOREIGN KEY (parent_id, company_id)
    REFERENCES public.inventory_categories(id, company_id) ON DELETE SET NULL (parent_id),
  CONSTRAINT inventory_categories_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT inventory_categories_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);

CREATE INDEX idx_inventory_categories_company ON public.inventory_categories(company_id, name);
CREATE INDEX idx_inventory_categories_parent  ON public.inventory_categories(parent_id) WHERE parent_id IS NOT NULL;

CREATE TRIGGER trg_inventory_categories_updated_at
  BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_inventory_categories_immutable_company_id
  BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 3c. inventory_items: anagrafica articoli (nessuna quantità qui)
--     reorder_level / reorder_qty sono nell'unità di scarico, come la giacenza.
--     conversion_factor = unità di scarico contenute in 1 unità di carico.
-- ----------------------------------------------------------------------------
CREATE TABLE public.inventory_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sku               TEXT          NOT NULL,
  name              TEXT          NOT NULL,
  item_type_id      UUID          NOT NULL,
  category_id       UUID,
  unit              TEXT          NOT NULL DEFAULT 'pz',
  issue_unit        TEXT,
  conversion_factor NUMERIC(14,4) NOT NULL DEFAULT 1,
  reorder_level     NUMERIC(14,3),
  reorder_qty       NUMERIC(14,3),
  purchase_price    NUMERIC(12,2),
  sale_price        NUMERIC(12,2),
  vat_rate          NUMERIC(5,2),
  attributes        JSONB         NOT NULL DEFAULT '{}',
  note              TEXT,
  archived_at       TIMESTAMPTZ,
  created_by        UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT inventory_items_sku_unique UNIQUE (company_id, sku),
  CONSTRAINT inventory_items_id_company_id_key UNIQUE (id, company_id),
  -- NO ACTION (non RESTRICT): la cancellazione in cascata dello studio resta possibile.
  CONSTRAINT inventory_items_type_fkey FOREIGN KEY (item_type_id, company_id)
    REFERENCES public.inventory_item_types(id, company_id),
  CONSTRAINT inventory_items_category_fkey FOREIGN KEY (category_id, company_id)
    REFERENCES public.inventory_categories(id, company_id) ON DELETE SET NULL (category_id),
  CONSTRAINT inventory_items_sku_length CHECK (char_length(sku) BETWEEN 1 AND 64),
  CONSTRAINT inventory_items_name_length CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT inventory_items_unit_length CHECK (char_length(unit) BETWEEN 1 AND 20),
  CONSTRAINT inventory_items_issue_unit_length CHECK (issue_unit IS NULL OR char_length(issue_unit) BETWEEN 1 AND 20),
  CONSTRAINT inventory_items_conversion_positive CHECK (conversion_factor > 0),
  CONSTRAINT inventory_items_reorder_nonneg CHECK (
    (reorder_level IS NULL OR reorder_level >= 0) AND (reorder_qty IS NULL OR reorder_qty >= 0)
  ),
  CONSTRAINT inventory_items_prices_nonneg CHECK (
    (purchase_price IS NULL OR purchase_price >= 0) AND (sale_price IS NULL OR sale_price >= 0)
  ),
  CONSTRAINT inventory_items_vat_range CHECK (vat_rate IS NULL OR vat_rate BETWEEN 0 AND 100),
  CONSTRAINT inventory_items_attributes_object CHECK (jsonb_typeof(attributes) = 'object')
);

CREATE INDEX idx_inventory_items_company  ON public.inventory_items(company_id, name);
CREATE INDEX idx_inventory_items_type     ON public.inventory_items(company_id, item_type_id);
CREATE INDEX idx_inventory_items_category ON public.inventory_items(company_id, category_id);
CREATE INDEX idx_inventory_items_created_by ON public.inventory_items(created_by);

CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_inventory_items_created_by
  BEFORE INSERT ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_inventory_items_immutable_created_by
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_inventory_items_immutable_company_id
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- Flag del tipo sull'articolo: frazionabile → unità di scarico; vendibile → prezzo e IVA.
-- Non frazionabile: unità di scarico = unità di carico (issue_unit NULL, fattore 1).
CREATE OR REPLACE FUNCTION public.inventory_item_validate()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_type public.inventory_item_types%ROWTYPE;
BEGIN
  -- Solo i campi che dipendono dal tipo: un cambio di flag non blocca modifiche estranee.
  IF TG_OP = 'UPDATE'
     AND NEW.item_type_id = OLD.item_type_id
     AND NEW.issue_unit IS NOT DISTINCT FROM OLD.issue_unit
     AND NEW.conversion_factor = OLD.conversion_factor
     AND NEW.sale_price IS NOT DISTINCT FROM OLD.sale_price
     AND NEW.vat_rate IS NOT DISTINCT FROM OLD.vat_rate THEN
    RETURN NEW;
  END IF;

  -- Prima dell'RLS (valutata dopo i trigger BEFORE): nessuna lettura per estranei.
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.has_permission(NEW.company_id, 'inventory:write') THEN
    RAISE EXCEPTION 'Permesso inventory:write mancante' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type FROM public.inventory_item_types
  WHERE id = NEW.item_type_id AND company_id = NEW.company_id;
  IF NOT FOUND THEN
    RETURN NEW; -- ci pensa la FK
  END IF;

  NEW.issue_unit := nullif(btrim(NEW.issue_unit), '');
  IF v_type.fractional THEN
    IF NEW.issue_unit IS NULL THEN
      RAISE EXCEPTION 'Articolo frazionabile: indicare l''unità di scarico e il fattore di conversione'
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_item_rules';
    END IF;
  ELSE
    NEW.issue_unit := NULL;
    NEW.conversion_factor := 1;
  END IF;

  IF v_type.sellable AND (NEW.sale_price IS NULL OR NEW.vat_rate IS NULL) THEN
    RAISE EXCEPTION 'Articolo in vendita: indicare prezzo di vendita e aliquota IVA'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_item_rules';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_items_validate
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_item_validate();

-- ----------------------------------------------------------------------------
-- 3d. inventory_movements: registro append-only
--     carico / reso (dal cliente) > 0; scarico < 0; rettifica ≠ 0.
-- ----------------------------------------------------------------------------
CREATE TABLE public.inventory_movements (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id        UUID          NOT NULL,
  movement_type  TEXT          NOT NULL,
  quantity       NUMERIC(14,3) NOT NULL,
  lot            TEXT,
  expiry_date    DATE,
  serial         TEXT,
  unit_cost      NUMERIC(12,4),
  client_id      UUID,
  appointment_id UUID,
  task_id        UUID,
  reason         TEXT,
  created_by     UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT inventory_movements_item_fkey FOREIGN KEY (item_id, company_id)
    REFERENCES public.inventory_items(id, company_id),
  CONSTRAINT inventory_movements_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE SET NULL (client_id),
  CONSTRAINT inventory_movements_appointment_fkey FOREIGN KEY (appointment_id, company_id)
    REFERENCES public.calendar_events(id, company_id) ON DELETE SET NULL (appointment_id),
  CONSTRAINT inventory_movements_task_fkey FOREIGN KEY (task_id, company_id)
    REFERENCES public.tasks(id, company_id) ON DELETE SET NULL (task_id),
  CONSTRAINT inventory_movements_type_check CHECK (
    movement_type IN ('carico', 'scarico', 'rettifica', 'reso')
  ),
  CONSTRAINT inventory_movements_sign_check CHECK (
    (movement_type IN ('carico', 'reso') AND quantity > 0)
    OR (movement_type = 'scarico' AND quantity < 0)
    OR (movement_type = 'rettifica' AND quantity <> 0)
  ),
  CONSTRAINT inventory_movements_unit_cost_nonneg CHECK (unit_cost IS NULL OR unit_cost >= 0),
  CONSTRAINT inventory_movements_lot_length CHECK (lot IS NULL OR char_length(lot) BETWEEN 1 AND 64),
  CONSTRAINT inventory_movements_serial_length CHECK (serial IS NULL OR char_length(serial) BETWEEN 1 AND 64),
  CONSTRAINT inventory_movements_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX idx_inventory_movements_item    ON public.inventory_movements(company_id, item_id, created_at DESC);
CREATE INDEX idx_inventory_movements_serial  ON public.inventory_movements(item_id, serial) WHERE serial IS NOT NULL;
CREATE INDEX idx_inventory_movements_client  ON public.inventory_movements(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_inventory_movements_appointment ON public.inventory_movements(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_inventory_movements_task    ON public.inventory_movements(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_inventory_movements_created_by ON public.inventory_movements(created_by);

CREATE TRIGGER trg_inventory_movements_created_by
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ----------------------------------------------------------------------------
-- 3e. inventory_stock: giacenza per articolo + lotto + scadenza (solo trigger)
-- ----------------------------------------------------------------------------
CREATE TABLE public.inventory_stock (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id     UUID          NOT NULL,
  lot         TEXT,
  expiry_date DATE,
  quantity    NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT inventory_stock_item_fkey FOREIGN KEY (item_id, company_id)
    REFERENCES public.inventory_items(id, company_id) ON DELETE CASCADE,
  CONSTRAINT inventory_stock_key_unique UNIQUE NULLS NOT DISTINCT (company_id, item_id, lot, expiry_date),
  CONSTRAINT inventory_stock_nonneg CHECK (quantity >= 0)
);

CREATE INDEX idx_inventory_stock_item   ON public.inventory_stock(company_id, item_id);
CREATE INDEX idx_inventory_stock_expiry ON public.inventory_stock(company_id, expiry_date)
  WHERE expiry_date IS NOT NULL AND quantity > 0;

-- ----------------------------------------------------------------------------
-- 4. Trigger dei movimenti
--    SECURITY DEFINER: legge tipi/giacenze e scrive inventory_stock (nessun grant
--    di scrittura agli utenti). L'RLS WITH CHECK dell'INSERT è valutata DOPO i
--    trigger BEFORE: il permesso è verificato qui per primo, così un utente di
--    un altro studio non ottiene informazioni dai messaggi di errore.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_movement_validate()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_item       public.inventory_items%ROWTYPE;
  v_type       public.inventory_item_types%ROWTYPE;
  v_available  NUMERIC;
  v_serial_net NUMERIC;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.has_permission(NEW.company_id, 'inventory:write') THEN
    RAISE EXCEPTION 'Permesso inventory:write mancante' USING ERRCODE = '42501';
  END IF;

  -- Lock dell'articolo: serializza i movimenti dello stesso articolo
  -- (giacenza e matricole). NO KEY UPDATE non blocca le FK.
  SELECT * INTO v_item FROM public.inventory_items
  WHERE id = NEW.item_id AND company_id = NEW.company_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Articolo inesistente' USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
  END IF;
  IF v_item.archived_at IS NOT NULL AND NEW.movement_type IN ('carico', 'scarico') THEN
    RAISE EXCEPTION 'Articolo archiviato: sono ammessi solo rettifiche e resi'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
  END IF;

  SELECT * INTO v_type FROM public.inventory_item_types
  WHERE id = v_item.item_type_id AND company_id = NEW.company_id;

  -- Il registro non si retrodata.
  NEW.created_at := now();
  NEW.lot    := nullif(btrim(NEW.lot), '');
  NEW.serial := nullif(btrim(NEW.serial), '');
  NEW.reason := nullif(btrim(NEW.reason), '');

  -- Campi non tracciati dal tipo: ignorati.
  IF NOT v_type.track_lot THEN
    NEW.lot := NULL;
  ELSIF NEW.lot IS NULL THEN
    RAISE EXCEPTION 'Lotto obbligatorio per questo tipo di articolo'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
  END IF;

  IF NOT v_type.track_expiry THEN
    NEW.expiry_date := NULL;
  ELSIF NEW.expiry_date IS NULL THEN
    RAISE EXCEPTION 'Data di scadenza obbligatoria per questo tipo di articolo'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
  END IF;

  IF NOT v_type.track_serial THEN
    NEW.serial := NULL;
  ELSE
    IF NEW.serial IS NULL THEN
      RAISE EXCEPTION 'Matricola obbligatoria per questo tipo di articolo'
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
    END IF;
    IF abs(NEW.quantity) <> 1 THEN
      RAISE EXCEPTION 'Con la matricola ogni movimento riguarda un solo pezzo'
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
    END IF;
    SELECT coalesce(sum(quantity), 0) INTO v_serial_net
    FROM public.inventory_movements
    WHERE item_id = NEW.item_id AND company_id = NEW.company_id AND serial = NEW.serial;
    IF NEW.quantity > 0 AND v_serial_net > 0 THEN
      RAISE EXCEPTION 'Matricola % già presente a magazzino', NEW.serial
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
    END IF;
    IF NEW.quantity < 0 AND v_serial_net < 1 THEN
      RAISE EXCEPTION 'Matricola % non presente a magazzino', NEW.serial
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
    END IF;
  END IF;

  IF NEW.movement_type = 'scarico' AND v_type.requires_client_on_issue AND NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'Lo scarico di questo tipo di articolo richiede il cliente'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
  END IF;

  IF NEW.quantity < 0 THEN
    SELECT quantity INTO v_available FROM public.inventory_stock
    WHERE company_id = NEW.company_id AND item_id = NEW.item_id
      AND lot IS NOT DISTINCT FROM NEW.lot
      AND expiry_date IS NOT DISTINCT FROM NEW.expiry_date;
    IF coalesce(v_available, 0) + NEW.quantity < 0 THEN
      RAISE EXCEPTION 'Giacenza insufficiente: disponibili %', coalesce(v_available, 0)
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_movement_rules';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_movement_apply()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.inventory_stock (company_id, item_id, lot, expiry_date, quantity)
  VALUES (NEW.company_id, NEW.item_id, NEW.lot, NEW.expiry_date, NEW.quantity)
  ON CONFLICT (company_id, item_id, lot, expiry_date)
  DO UPDATE SET quantity = public.inventory_stock.quantity + EXCLUDED.quantity,
                updated_at = now();
  RETURN NULL;
END;
$$;

-- "trg_inventory_movements_validate" segue "..._created_by" in ordine alfabetico.
CREATE TRIGGER trg_inventory_movements_validate
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movement_validate();

CREATE TRIGGER trg_inventory_movements_apply
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movement_apply();

REVOKE ALL ON FUNCTION public.inventory_item_validate()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_movement_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_movement_apply()    FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_item_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_item_types FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock      FORCE  ROW LEVEL SECURITY;

-- Tipi: letti da chi vede il magazzino o gestisce lo studio; gestiti da settings:manage.
CREATE POLICY "inventory_item_types_select" ON public.inventory_item_types
  FOR SELECT USING (public.has_permission(company_id, 'inventory:read') OR public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "inventory_item_types_insert" ON public.inventory_item_types
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "inventory_item_types_update" ON public.inventory_item_types
  FOR UPDATE USING (public.has_permission(company_id, 'settings:manage'))
  WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "inventory_item_types_delete" ON public.inventory_item_types
  FOR DELETE USING (public.has_permission(company_id, 'settings:manage'));

-- Categorie: inventory:*.
CREATE POLICY "inventory_categories_select" ON public.inventory_categories
  FOR SELECT USING (public.has_permission(company_id, 'inventory:read'));
CREATE POLICY "inventory_categories_insert" ON public.inventory_categories
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'inventory:write'));
CREATE POLICY "inventory_categories_update" ON public.inventory_categories
  FOR UPDATE USING (public.has_permission(company_id, 'inventory:write'))
  WITH CHECK (public.has_permission(company_id, 'inventory:write'));
CREATE POLICY "inventory_categories_delete" ON public.inventory_categories
  FOR DELETE USING (public.has_permission(company_id, 'inventory:write'));

-- Articoli: anagrafica condivisa (modifica con inventory:write); eliminazione solo
-- con records:manage e solo senza movimenti (FK), altrimenti si archivia.
CREATE POLICY "inventory_items_select" ON public.inventory_items
  FOR SELECT USING (public.has_permission(company_id, 'inventory:read'));
CREATE POLICY "inventory_items_insert" ON public.inventory_items
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'inventory:write'));
CREATE POLICY "inventory_items_update" ON public.inventory_items
  FOR UPDATE USING (public.has_permission(company_id, 'inventory:write'))
  WITH CHECK (public.has_permission(company_id, 'inventory:write'));
CREATE POLICY "inventory_items_delete" ON public.inventory_items
  FOR DELETE USING (
    public.has_permission(company_id, 'inventory:write')
    AND public.has_permission(company_id, 'records:manage')
  );

-- Movimenti: solo lettura e inserimento (append-only).
CREATE POLICY "inventory_movements_select" ON public.inventory_movements
  FOR SELECT USING (public.has_permission(company_id, 'inventory:read'));
CREATE POLICY "inventory_movements_insert" ON public.inventory_movements
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'inventory:write'));

-- Giacenza: solo lettura (scritta dal trigger).
CREATE POLICY "inventory_stock_select" ON public.inventory_stock
  FOR SELECT USING (public.has_permission(company_id, 'inventory:read'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_item_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items      TO authenticated;
REVOKE ALL ON public.inventory_movements FROM authenticated;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
REVOKE ALL ON public.inventory_stock FROM authenticated;
GRANT SELECT ON public.inventory_stock TO authenticated;
REVOKE ALL ON public.inventory_item_types FROM anon;
REVOKE ALL ON public.inventory_categories FROM anon;
REVOKE ALL ON public.inventory_items      FROM anon;
REVOKE ALL ON public.inventory_movements  FROM anon;
REVOKE ALL ON public.inventory_stock      FROM anon;

-- ----------------------------------------------------------------------------
-- 6. Preset v2: modulo inventory, item_types, termini del magazzino
--    payload.item_types: [{key, label, track_lot, track_expiry, track_serial,
--      consumable, fractional, sellable, requires_client_on_issue, position}]
-- ----------------------------------------------------------------------------
INSERT INTO public.vertical_templates (key, version, label, description, payload)
SELECT t.key, 2, t.label, t.description,
       jsonb_set(
         jsonb_set(
           jsonb_set(t.payload, '{modules,inventory}', to_jsonb(p.inventory)),
           '{terms}', (t.payload -> 'terms') || p.terms),
         '{item_types}', p.item_types)
FROM public.vertical_templates t
JOIN (VALUES
  ('dentale', true,
   '{"inventoryLabel": "Materiali", "itemSingular": "Materiale", "itemPlural": "Materiali",
     "inventorySubtitle": "Impianti, materiali di consumo e farmaci con lotti e scadenze"}'::jsonb,
   '[{"key": "impianti", "label": "Impianti", "track_lot": true, "track_expiry": true, "track_serial": true, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": true, "position": 10},
     {"key": "consumo",  "label": "Materiali di consumo", "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": false, "position": 20},
     {"key": "farmaci",  "label": "Farmaci", "track_lot": true, "track_expiry": true, "track_serial": false, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": false, "position": 30}]'::jsonb),
  ('medico', true,
   '{"inventoryLabel": "Farmaci & presidi", "itemSingular": "Prodotto", "itemPlural": "Prodotti",
     "inventorySubtitle": "Farmaci e presidi con lotti, scadenze e scorte minime"}'::jsonb,
   '[{"key": "farmaci", "label": "Farmaci", "track_lot": true, "track_expiry": true, "track_serial": false, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": false, "position": 10},
     {"key": "presidi", "label": "Presidi", "track_lot": true, "track_expiry": true, "track_serial": false, "consumable": true, "fractional": false, "sellable": false, "requires_client_on_issue": false, "position": 20}]'::jsonb),
  ('estetico', true,
   '{"inventoryLabel": "Prodotti", "itemSingular": "Prodotto", "itemPlural": "Prodotti",
     "inventorySubtitle": "Prodotti di cabina e di vendita, scorte e scadenze"}'::jsonb,
   '[{"key": "cabina",  "label": "Prodotti cabina", "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": true, "sellable": false, "requires_client_on_issue": false, "position": 10},
     {"key": "vendita", "label": "Prodotti vendita", "track_lot": false, "track_expiry": false, "track_serial": false, "consumable": true, "fractional": false, "sellable": true, "requires_client_on_issue": false, "position": 20}]'::jsonb),
  ('commercialista', false,
   '{"inventoryLabel": "Magazzino", "itemSingular": "Articolo", "itemPlural": "Articoli",
     "inventorySubtitle": "Articoli, giacenze e movimenti di magazzino"}'::jsonb,
   '[]'::jsonb),
  ('legale', false,
   '{"inventoryLabel": "Magazzino", "itemSingular": "Articolo", "itemPlural": "Articoli",
     "inventorySubtitle": "Articoli, giacenze e movimenti di magazzino"}'::jsonb,
   '[]'::jsonb),
  ('generico', false,
   '{"inventoryLabel": "Magazzino", "itemSingular": "Articolo", "itemPlural": "Articoli",
     "inventorySubtitle": "Articoli, giacenze e movimenti di magazzino"}'::jsonb,
   '[]'::jsonb)
) AS p(key, inventory, terms, item_types) ON p.key = t.key
WHERE t.version = 1;

-- apply_vertical_template: come prima + item_types (idempotente).
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
    (company_id, key, label, track_lot, track_expiry, track_serial, consumable,
     fractional, sellable, requires_client_on_issue, position)
  SELECT p_company_id, i.key, i.label, i.track_lot, i.track_expiry, i.track_serial, i.consumable,
         i.fractional, i.sellable, i.requires_client_on_issue, i.position
  FROM jsonb_to_recordset(coalesce(v_tpl.payload -> 'item_types', '[]'::jsonb)) AS i(
    key TEXT, label TEXT, track_lot BOOLEAN, track_expiry BOOLEAN, track_serial BOOLEAN,
    consumable BOOLEAN, fractional BOOLEAN, sellable BOOLEAN, requires_client_on_issue BOOLEAN,
    position INTEGER)
  ON CONFLICT (company_id, key) DO NOTHING;

  RETURN v_tpl.version;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) TO authenticated;

-- Studi esistenti: solo le novità della v2 (non si ripristinano campi o tipi di
-- appuntamento eliminati dallo studio). Termini personalizzati conservati.
INSERT INTO public.company_modules (company_id, module, enabled)
SELECT c.id, 'inventory', coalesce((t.payload -> 'modules' ->> 'inventory')::boolean, false)
FROM public.companies c
JOIN public.vertical_templates t ON t.key = c.sector AND t.version = 2
ON CONFLICT (company_id, module) DO NOTHING;

INSERT INTO public.inventory_item_types
  (company_id, key, label, track_lot, track_expiry, track_serial, consumable,
   fractional, sellable, requires_client_on_issue, position)
SELECT c.id, i.key, i.label, i.track_lot, i.track_expiry, i.track_serial, i.consumable,
       i.fractional, i.sellable, i.requires_client_on_issue, i.position
FROM public.companies c
JOIN public.vertical_templates t ON t.key = c.sector AND t.version = 2
CROSS JOIN LATERAL jsonb_to_recordset(t.payload -> 'item_types') AS i(
  key TEXT, label TEXT, track_lot BOOLEAN, track_expiry BOOLEAN, track_serial BOOLEAN,
  consumable BOOLEAN, fractional BOOLEAN, sellable BOOLEAN, requires_client_on_issue BOOLEAN,
  position INTEGER)
ON CONFLICT (company_id, key) DO NOTHING;

UPDATE public.companies c
SET terms = (t.payload -> 'terms') || c.terms,
    template_version = 2
FROM public.vertical_templates t
WHERE t.key = c.sector AND t.version = 2;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
