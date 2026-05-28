-- Relleno de documentos para alumnos demo, para que pasen la validación
-- must_complete_profile y puedan entrar al dashboard.
-- Solo afecta filas con documentos vacíos (idempotente vía COALESCE/NULLIF).
-- Los números deben ser de 1-5 dígitos (validación del backend /^\d{1,5}$/).
UPDATE public.alumno
SET certificado_medico         = COALESCE(certificado_medico, DATE '2027-12-31'),
    certificado_medico_numero  = COALESCE(NULLIF(certificado_medico_numero, ''), '10001'),
    seguro_vida                = COALESCE(seguro_vida, 'ASEGURADORA DEMO'),
    seguro_vida_vencimiento    = COALESCE(seguro_vida_vencimiento, DATE '2027-12-31'),
    seguro_vida_numero         = COALESCE(NULLIF(seguro_vida_numero, ''), '20002'),
    numero_licencia            = COALESCE(NULLIF(numero_licencia, ''), '9999');
