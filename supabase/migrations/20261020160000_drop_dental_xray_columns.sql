-- ============================================================================
-- Migration: drop_dental_xray_columns
-- Description: rimuove da client_clinical i dati specifici dello studio dentistico
--   (dente selezionato e reperti radiografici). La visualizzazione di radiografie e
--   schema dentale è stata tolta dall'interfaccia: i dati non sono più usati.
--   ATTENZIONE: i valori esistenti vengono cancellati.
-- Depends on: 20261020120000_vertical_templates.sql
-- ============================================================================

ALTER TABLE public.client_clinical
  DROP COLUMN selected_tooth,
  DROP COLUMN xray_findings;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
