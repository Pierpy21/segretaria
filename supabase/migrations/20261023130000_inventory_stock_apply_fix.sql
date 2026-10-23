-- ============================================================================
-- Migration: inventory_stock_apply_fix
-- Description: inventory_movement_apply usava INSERT ... ON CONFLICT DO UPDATE:
--   il CHECK inventory_stock_nonneg è valutato sulla riga candidata dell'INSERT
--   (quantità negativa per gli scarichi) prima dell'ON CONFLICT, quindi ogni
--   uscita veniva rifiutata. Ora: UPDATE della riga esistente, INSERT solo se
--   manca (entrate; le uscite senza riga sono già rifiutate dalla validazione).
--   La concorrenza è serializzata dal lock dell'articolo in inventory_movement_validate.
-- Depends on: 20261023120000_inventory.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.inventory_movement_apply()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.inventory_stock
  SET quantity = quantity + NEW.quantity,
      updated_at = now()
  WHERE company_id = NEW.company_id AND item_id = NEW.item_id
    AND lot IS NOT DISTINCT FROM NEW.lot
    AND expiry_date IS NOT DISTINCT FROM NEW.expiry_date;

  IF NOT FOUND THEN
    INSERT INTO public.inventory_stock (company_id, item_id, lot, expiry_date, quantity)
    VALUES (NEW.company_id, NEW.item_id, NEW.lot, NEW.expiry_date, NEW.quantity);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_movement_apply() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
