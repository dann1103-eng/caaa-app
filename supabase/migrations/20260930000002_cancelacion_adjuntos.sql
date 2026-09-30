-- Constancias (imágenes o PDF) que el alumno puede adjuntar OPCIONALMENTE a su
-- solicitud de cancelación, para respaldar el motivo. Nunca es requisito para
-- enviar la solicitud: la solicitud se crea primero y los adjuntos se suben
-- después, así que una falla de Storage no puede impedir una cancelación.
--
-- ON DELETE CASCADE porque quitarSolicitudCancelacion hace un DELETE real de la
-- fila; sin la cascada quedarían adjuntos huérfanos apuntando a una solicitud
-- que ya no existe. El objeto en Storage se borra aparte, best-effort.
CREATE TABLE IF NOT EXISTS public.solicitud_cancelacion_adjunto (
  id_adjunto               bigserial PRIMARY KEY,
  id_solicitud_cancelacion bigint NOT NULL
    REFERENCES public.solicitud_cancelacion(id_solicitud_cancelacion) ON DELETE CASCADE,
  nombre_archivo           text NOT NULL,
  archivo_path             text NOT NULL,
  content_type             text,
  tamano_bytes             integer,
  subido_por               integer,
  subido_en                timestamp without time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancelacion_adjunto_solicitud
  ON public.solicitud_cancelacion_adjunto (id_solicitud_cancelacion);
