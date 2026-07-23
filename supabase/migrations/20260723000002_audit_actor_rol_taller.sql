-- El rol TALLER ahora puede corregir el TAC de un avión (POST /taller/horas-manuales,
-- mismo endpoint auditado que ya usa Admin → Mantenimiento), pero audit_actor_rol
-- no lo incluía → logAuditoria fallaba con "invalid input value for enum
-- audit_actor_rol: TALLER" y el endpoint devolvía 500.
ALTER TYPE public.audit_actor_rol ADD VALUE IF NOT EXISTS 'TALLER';
