-- Crea la fila de la semana siguiente en semana_vuelo si no existe.
-- Necesario porque la semana actual se sembró ya publicada y el flujo normal
-- (publicar semana) es el único que crea la siguiente → el agendado manual
-- queda bloqueado con "No se encontró la semana siguiente".
-- Calcula el lunes de la semana próxima dinámicamente (idempotente).
INSERT INTO semana_vuelo (fecha_inicio, fecha_fin, publicada)
SELECT
  date_trunc('week', CURRENT_DATE)::date + INTERVAL '7 days',
  date_trunc('week', CURRENT_DATE)::date + INTERVAL '13 days',
  false
WHERE NOT EXISTS (
  SELECT 1 FROM semana_vuelo
  WHERE fecha_inicio = date_trunc('week', CURRENT_DATE)::date + INTERVAL '7 days'
);
