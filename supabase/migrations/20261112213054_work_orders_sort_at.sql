-- Ordine manuale dei lavori nell'agenda.
-- Chiave di ordinamento effettiva = coalesce(sort_at, calendar_events.start_at dell'appuntamento, created_at).
-- NULL = ordine automatico per data; valorizzata quando l'utente sposta il lavoro (punto medio tra i vicini).
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS sort_at TIMESTAMPTZ;

COMMENT ON COLUMN public.work_orders.sort_at IS
  'Ordine manuale in agenda: NULL = automatico (data appuntamento o creazione).';
