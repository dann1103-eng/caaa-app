import { useEffect, useState } from "react";
import { MARCA, IMG } from "../../marca";
import "./Manual.css";

const NAV = [
  { group: "Empezar aquí", items: [
    { id: "portada", label: "Cómo usar este manual", icon: "bi-journal-bookmark" },
    { id: "ciclo", label: "Ciclo de vida de un vuelo", icon: "bi-arrow-repeat" },
  ]},
  { group: "Manuales por rol", items: [
    { id: "alumno", label: "Alumno", icon: "bi-mortarboard", num: "01" },
    { id: "instructor", label: "Instructor", icon: "bi-headset", num: "02" },
    { id: "turno", label: "Turno", icon: "bi-megaphone", num: "03" },
    { id: "programacion", label: "Programación", icon: "bi-grid-3x3-gap", num: "04" },
    { id: "administracion", label: "Administración", icon: "bi-cash-coin", num: "05" },
    { id: "taller", label: "Taller", icon: "bi-tools", num: "06" },
    { id: "admin", label: "Admin", icon: "bi-shield-check", num: "07" },
  ]},
];

const ROLE_CARDS = [
  { id: "alumno", icon: "bi-mortarboard", title: "Alumno", text: "Agendar vuelos, llenar el loadsheet, revisar tu cuenta y tu avance en el aula virtual." },
  { id: "instructor", icon: "bi-headset", title: "Instructor", text: "Marcar las etapas de cada vuelo, llenar el reporte de vuelo y calificar en el aula virtual." },
  { id: "turno", icon: "bi-megaphone", title: "Turno", text: "Abrir y cerrar el turno, monitorear los vuelos del día, publicar avisos y generar el reporte de cierre." },
  { id: "programacion", icon: "bi-grid-3x3-gap", title: "Programación", text: "Organizar el calendario semanal, asignar aeronaves y resolver conflictos de horario." },
  { id: "administracion", icon: "bi-cash-coin", title: "Administración", text: "Cuentas corrientes, contabilidad, usuarios, cursos y documentación de alumnos." },
  { id: "taller", icon: "bi-tools", title: "Taller", text: "Órdenes de trabajo, pedidos de material, inventario, libros del avión y aeronavegabilidad." },
  { id: "admin", icon: "bi-shield-check", title: "Admin", text: "Acceso completo: supervisa operaciones, administración y taller desde un solo lugar." },
];

function Step({ n, title, children }) {
  return (
    <article className="man__step">
      <div className="man__step-num">{n}</div>
      <div className="man__step-body">
        <div className="man__step-title">{title}</div>
        {children}
      </div>
    </article>
  );
}

function SectionHead({ icon, children, hint }) {
  return (
    <div className="man__section-head">
      <h2>{icon && <i className={`bi ${icon}`} />}{children}</h2>
      {hint && <p>{hint}</p>}
    </div>
  );
}

function Chip({ variant = "primary", children }) {
  return <span className={`man__chip-btn man__chip-btn--${variant}`}>{children}</span>;
}

function Badge({ variant, children }) {
  return <span className={`man__chip-badge man__chip-badge--${variant}`}>{children}</span>;
}

function LoginCTA() {
  return (
    <a href="/login" className="man__login-cta">
      <span className="man__login-cta-icon"><i className="bi bi-box-arrow-in-right" /></span>
      <span className="man__login-cta-copy">
        <span className="man__login-cta-title">Ir a iniciar sesión</span>
        <span className="man__login-cta-sub">Entrá al sistema con tu usuario y contraseña</span>
      </span>
      <i className="bi bi-arrow-right man__login-cta-arrow" />
    </a>
  );
}

// `solo`: restringe el manual a UNA sola página (ej. /manual/alumno con
// solo="alumno") — los alumnos reciben ese enlace y no ven los manuales del
// resto de roles. Sin `solo`, es el manual completo de siempre (/manual).
export default function Manual({ solo = null }) {
  const isAllowed = (id) => !solo || id === solo;
  const [active, setActive] = useState(solo || "portada");

  useEffect(() => {
    const h = (window.location.hash || "").replace("#", "");
    if (h && isAllowed(h)) setActive(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (id) => {
    if (!isAllowed(id)) return;
    setActive(id);
    window.scrollTo(0, 0);
    try { history.replaceState(null, "", "#" + id); } catch { /* noop */ }
  };

  const nav = solo
    ? NAV.map((g) => ({ ...g, items: g.items.filter((it) => isAllowed(it.id)) })).filter((g) => g.items.length > 0)
    : NAV;

  return (
    <div className="man__shell">
      <nav className="man__rail" aria-label="Manuales por rol">
        <div className="man__brand">
          <div className="man__brand-mark"><img src={IMG.isoBlanco} alt={MARCA.nombre} /></div>
          <div>
            <div className="man__brand-title">{MARCA.nombre}</div>
            <div className="man__brand-sub">{solo === "alumno" ? "Manual del alumno" : "Manual de usuario"}</div>
          </div>
        </div>

        {nav.map((g) => (
          <div key={g.group}>
            <div className="man__rail-label">{g.group}</div>
            {g.items.map((it) => (
              <button
                key={it.id}
                className="man__navbtn"
                aria-current={active === it.id}
                onClick={() => go(it.id)}
              >
                <i className={`bi ${it.icon}`} />
                {it.label}
                {it.num && <span className="man__navbtn-idx">{it.num}</span>}
              </button>
            ))}
          </div>
        ))}

        <div className="man__rail-foot">
          <a href="/login" className="man__rail-login-btn">
            <i className="bi bi-box-arrow-in-right" />
            Iniciar sesión
          </a>
          <p>{MARCA.nombre} · {MARCA.direccion}</p>
        </div>
      </nav>

      <main>
        {/* ───────── PORTADA ───────── */}
        <section className={`man__page ${active === "portada" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-journal-bookmark" />Guía general</div>
          <h1 className="man__title">Manual de usuario del sistema {MARCA.nombre}</h1>
          <p className="man__lede">
            Esta guía explica, paso a paso, cómo usar el sistema desde el perfil de cada persona:
            alumno, instructor, turno, programación, administración y taller. Cada capítulo cubre
            las tareas que hacés todos los días — en el mismo orden en que las hacés.
          </p>

          <div className="man__callout">
            <h4><i className="bi bi-info-circle" />Cómo leer los pasos</h4>
            <p>
              Cada procedimiento está numerado en el orden en que se ejecuta. Los recuadros que ves junto
              al texto (botones, pestañas, etiquetas de color) son una réplica fiel de lo que vas a
              encontrar en pantalla — el mismo texto, el mismo color. Si el botón dice{" "}
              <Chip variant="primary">Guardar</Chip> en el manual, vas a ver exactamente ese botón en el sistema.
            </p>
          </div>

          <div className="man__section-head" style={{ marginTop: 38 }}>
            <h2>Elegí tu manual</h2>
            <p>Los siete roles del sistema. Hacé clic en el tuyo — o navegá desde el panel de la izquierda.</p>
          </div>

          <div className="man__roles-grid">
            {ROLE_CARDS.map((r) => (
              <button key={r.id} className="man__role-card" onClick={() => go(r.id)}>
                <div className="man__role-card-top"><i className={`bi ${r.icon}`} /><span>{r.title}</span></div>
                <p>{r.text}</p>
              </button>
            ))}
          </div>

          <hr className="man__sep" />

          <SectionHead>Antes de empezar</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Iniciá sesión con tu usuario y contraseña">
              <p className="man__step-text">Te los entrega la academia. Si es tu primer ingreso, el sistema te va a pedir <strong>confirmar tus datos</strong> (nombre, correo, teléfono, DUI o pasaporte) antes de dejarte continuar — es un paso obligatorio, una sola vez.</p>
            </Step>
            <Step n={2} title="Ubicá tu panel principal">
              <p className="man__step-text">Al entrar siempre vas a ver primero el estado del aeródromo (Operaciones) y los avisos del día — antes que cualquier otra cosa. Es lo primero que hay que revisar cada mañana.</p>
            </Step>
            <Step n={3} title={<>Tu perfil (<code>/perfil</code>)</>}>
              <p className="man__step-text">Desde el ícono de perfil en la barra superior accedés a tus datos, documentos, cuenta corriente e historial — sin importar tu rol.</p>
            </Step>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── CICLO DE VIDA ───────── */}
        <section className={`man__page ${active === "ciclo" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-arrow-repeat" />Referencia compartida</div>
          <h1 className="man__title">Ciclo de vida de un vuelo</h1>
          <p className="man__lede">
            Todo vuelo agendado pasa por los mismos seis estados, de izquierda a derecha. <strong>Instructor</strong>{" "}
            y <strong>Turno</strong> son los únicos que pueden avanzarlo — Turno solo como respaldo, si el
            instructor no lo hace. Volvé a esta página cada vez que un estado no te haga sentido.
          </p>

          <div className="man__states-rail">
            <Badge variant="gris">PROGRAMADO</Badge>
            <i className="bi bi-arrow-right" />
            <Badge variant="naranja">SALIDA HANGAR</Badge>
            <i className="bi bi-arrow-right" />
            <Badge variant="azul">EN PROGRESO</Badge>
            <i className="bi bi-arrow-right" />
            <Badge variant="morado">REGRESO HANGAR</Badge>
            <i className="bi bi-arrow-right" />
            <Badge variant="amarillo">FINALIZANDO</Badge>
            <i className="bi bi-arrow-right" />
            <Badge variant="verde">COMPLETADO</Badge>
          </div>

          <div className="man__legend-wrap">
            <table className="man__legend">
              <thead><tr><th>Estado</th><th>Qué significa</th><th>Quién lo marca</th></tr></thead>
              <tbody>
                <tr><td><Badge variant="gris">PROGRAMADO</Badge></td><td>El vuelo está agendado y publicado, pero todavía no ha empezado.</td><td>Se crea desde Programación o al aprobarse la solicitud del alumno.</td></tr>
                <tr><td><Badge variant="naranja">SALIDA HANGAR</Badge></td><td>La tripulación acaba de salir del hangar hacia la aeronave.</td><td>Botón <Chip>Salida del Hangar</Chip> (Instructor o Turno)</td></tr>
                <tr><td><Badge variant="azul">EN PROGRESO</Badge></td><td>El vuelo está en el aire.</td><td>Botón <Chip>En Vuelo</Chip></td></tr>
                <tr><td><Badge variant="morado">REGRESO HANGAR</Badge></td><td>La aeronave aterrizó y regresa al hangar.</td><td>Botón <Chip>Regreso al Hangar</Chip></td></tr>
                <tr><td><Badge variant="amarillo">FINALIZANDO</Badge></td><td>Última etapa antes de cerrar el vuelo — falta el checklist post-vuelo.</td><td>Botón <Chip>Finalizar Vuelo</Chip></td></tr>
                <tr><td><Badge variant="verde">COMPLETADO</Badge></td><td>El vuelo quedó cerrado. Ya se puede llenar el Reporte de Vuelo.</td><td>Automático al completar el checklist post-vuelo.</td></tr>
              </tbody>
            </table>
          </div>

          <div className="man__callout man__callout--accent">
            <h4><i className="bi bi-exclamation-triangle" />No podés avanzar un vuelo antes de su hora</h4>
            <p>El botón para pasar de <strong>PROGRAMADO</strong> a <strong>SALIDA HANGAR</strong> permanece
            deshabilitado hasta la hora exacta programada del vuelo. Es intencional: evita marcar salidas
            adelantadas por error.</p>
          </div>

          <div className="man__callout">
            <h4><i className="bi bi-info-circle" />¿Y si el alumno no llega?</h4>
            <p>Antes de marcar la salida del hangar, tenés disponible el botón <Chip variant="danger">Inasistencia</Chip>.
            Te va a pedir el motivo y cierra el vuelo con 0 minutos de tiempo de vuelo — no aplica a sesiones de simulador.</p>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── ALUMNO ───────── */}
        <section className={`man__page ${active === "alumno" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-mortarboard" />Manual 01</div>
          <h1 className="man__title">Alumno</h1>
          <p className="man__lede">Tu semana en el sistema: agendar tus vuelos, presentarte a volar con el loadsheet listo, y llevar el control de tu cuenta y tu curso teórico.</p>
          <div className="man__strip"><span>Agendar</span><span>Loadsheet</span><span>Cuenta</span><span>Aula virtual</span></div>

          <SectionHead icon="bi-geo-alt" hint="Lo primero que ves al entrar.">Tu panel principal</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Revisá el estado de Operaciones y los Avisos de Turno">
              <p className="man__step-text">Aparecen arriba de todo. Si dicen "Operación en standby" o algo similar, tu vuelo puede correrse — revisalo antes de salir hacia la academia.</p>
            </Step>
            <Step n={2} title="Tus datos de curso">
              <p className="man__step-text">Las tarjetas <strong>Licencia</strong>, <strong>Instructor</strong>, <strong>Límite Avión</strong> y <strong>Límite Simulador</strong> muestran cuántos vuelos podés agendar esta semana. Si tu límite está en 0, el botón de agendar se deshabilita.</p>
            </Step>
          </div>

          <SectionHead icon="bi-grid-3x3-gap" hint="Se hace una vez por semana, con margen suficiente para que Programación lo organice.">Agendar tus vuelos de la próxima semana</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Entrá a <Chip><i className="bi bi-plus-lg" />Agendar clase</Chip></>}>
              <p className="man__step-text">Está en la esquina superior derecha de tu panel. Te lleva a la grilla de la <strong>próxima semana</strong>.</p>
            </Step>
            <Step n={2} title="Escribí tus observaciones para el instructor">
              <p className="man__step-text">El campo <strong>Observaciones para tu instructor</strong> es obligatorio: contale otros horarios en los que también podés volar, por si tu primera opción no tiene cupo.</p>
              <div className="man__ui">
                <div className="man__field req"><label>Observaciones para tu instructor</label><div className="man__field-fake">Ej.: si no hay cupo el miércoles 9:00, puedo jueves después de las 14:00…</div></div>
              </div>
            </Step>
            <Step n={3} title="Elegí tus horarios en la grilla">
              <p className="man__step-text">Cada casilla es una combinación de <strong>hora + aeronave + día</strong>. Hacé clic en las que digan "Disponible para agendar" hasta llegar a tu límite semanal (máximo un avión por día, salvo que tu instructor te haya habilitado más de uno).</p>
              <div className="man__ui">
                <div className="man__grid-mock">
                  <table>
                    <thead><tr><th>Hora</th><th>Aeronave</th><th>Lun</th><th>Mar</th><th>Mié</th></tr></thead>
                    <tbody>
                      <tr><td>06:00</td><td>YS-334-PE</td><td className="on" /><td /><td /></tr>
                      <tr><td>07:30</td><td>YS-333-PE</td><td /><td /><td className="on" /></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Step>
            <Step n={4} title='Si el vuelo va a tener escala, marcá "Con parada"'>
              <p className="man__step-text">Aparece como casilla junto al horario. Tu ruta siempre empieza y termina en tu base — vos solo agregás los aeropuertos intermedios (hasta 4), en el orden en que los vas a tocar. Cada tramo se cierra y se reporta por separado, pero para tu límite semanal la ruta completa cuenta como <strong>un solo vuelo</strong>.</p>
            </Step>
            <Step n={5} title={<>Hacé clic en <Chip>Guardar (N vuelos)</Chip></>}>
              <p className="man__step-text">El botón muestra cuántos vuelos llevás seleccionados. Tu solicitud queda <strong>en revisión</strong>: Programación la organiza en el calendario y, cuando la publique, tus vuelos aparecen en tu horario con estado <Badge variant="gris">PROGRAMADO</Badge>.</p>
              <p className="man__note man__note--info"><i className="bi bi-info-circle" />Guardar no confirma el vuelo al instante — es una solicitud. Revisá tu horario más tarde para ver qué quedó publicado.</p>
              <p className="man__note man__note--warn"><i className="bi bi-exclamation-triangle" />Si tu saldo no alcanza para cubrir el vuelo, un aviso te lo advierte — pero no te bloquea: podés confirmar igual (por ejemplo, si vas a depositar antes de volar).</p>
            </Step>
          </div>

          <SectionHead icon="bi-clipboard2-check" hint={<>Hacelo <strong>antes</strong> de presentarte a volar — tu instructor lo revisa desde su panel.</>}>Llenar y enviar tu loadsheet</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Abrí el loadsheet desde tu vuelo agendado">
              <p className="man__step-text">El asistente tiene 5 pasos, en este orden:</p>
              <div className="man__ui">
                <div className="man__tabs">
                  <span className="on">1 · Aeronave</span><span>2 · Peso &amp; Balance</span><span>3 · Navegación</span><span>4 · Operaciones</span><span>5 · Resumen</span>
                </div>
              </div>
            </Step>
            <Step n={2} title="Paso 1 — Aeronave & Vuelo">
              <p className="man__step-text">Seleccioná la aeronave y completá fecha, hora UTC, y nombre/licencia tuya y de tu instructor.</p>
            </Step>
            <Step n={3} title="Paso 2 — Peso & Balance">
              <p className="man__step-text">Cargá los pesos (piloto, pasajeros, combustible, equipaje); el sistema calcula el centro de gravedad y te avisa si estás fuera del sobre de operación.</p>
            </Step>
            <Step n={4} title="Paso 3 — Navegación & Combustible">
              <p className="man__step-text">Completá el plan de vuelo (DEP, DEST, waypoints) y el planificador de combustible.</p>
            </Step>
            <Step n={5} title="Paso 4 — Operaciones">
              <p className="man__step-text">Datos del aeropuerto de salida y, si aplica, de retorno: pista activa, tipo de aproximación, visibilidad y techo requeridos.</p>
            </Step>
            <Step n={6} title="Paso 5 — Resumen & Envío">
              <p className="man__step-text">Revisá todo y elegí una acción:</p>
              <div className="man__ui">
                <Chip variant="outline">Vista previa e impresión</Chip>
                <Chip variant="outline">⬇ Descargar PDF</Chip>
                <Chip variant="positive">💾 Guardar borrador</Chip>
                <Chip variant="positive-fill">✉ Guardar y enviar</Chip>
              </div>
              <p className="man__step-text" style={{ marginTop: 10 }}><strong>Guardar y enviar</strong> es el paso que realmente se lo manda a tu instructor — sin eso, él no lo ve.</p>
            </Step>
          </div>

          <SectionHead icon="bi-cash-coin">Tu cuenta y tu curso</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Cuenta corriente">
              <p className="man__step-text">Desde <code>/perfil</code> vas a ver tus depósitos, cargos por vuelo y saldo actual — el modelo es de <strong>saldo prepagado</strong>: depositás y se te va debitando por cada vuelo.</p>
            </Step>
            <Step n={2} title="Aula Virtual">
              <p className="man__step-text">Material de estudio, exámenes y tu avance en el curso teórico. Al aprobar el examen final, un aviso te lo confirma.</p>
            </Step>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── INSTRUCTOR ───────── */}
        <section className={`man__page ${active === "instructor" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-headset" />Manual 02</div>
          <h1 className="man__title">Instructor</h1>
          <p className="man__lede">El corazón de tu día: marcar cada vuelo desde que sale del hangar hasta que se cierra, y dejar el reporte y el loadsheet en orden.</p>
          <div className="man__strip"><span>Marcar vuelo</span><span>Inasistencia</span><span>Checklist</span><span>Reporte</span><span>Regreso por emergencia</span><span>Rutas con escala</span><span>Loadsheet</span><span>Vuelos de práctica</span><span>Agenda de teoría</span><span>Aula virtual</span></div>

          <SectionHead icon="bi-arrow-repeat" hint={<>Repasá la <a href="#ciclo" onClick={(e) => { e.preventDefault(); go("ciclo"); }}>página de referencia del ciclo de vida</a> si algún estado no te hace sentido.</>}>Marcar las etapas de un vuelo</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Abrí tu Dashboard y ubicá el vuelo de hoy">
              <p className="man__step-text">Cada tarjeta muestra hora, aeronave, alumno y el estado actual con su color.</p>
            </Step>
            <Step n={2} title={<>A la hora programada, tocá <Chip>Salida del Hangar</Chip></>}>
              <p className="man__step-text">(En simulador el botón dice <strong>Iniciar Sesión</strong>). El botón permanece bloqueado hasta esa hora exacta — no se puede adelantar.</p>
            </Step>
            <Step n={3} title={<>Al despegar, tocá <Chip>En Vuelo</Chip></>}>
              <p className="man__step-text">La barra de progreso empieza a avanzar sola, calculada sobre la duración estimada del vuelo.</p>
            </Step>
            <Step n={4} title={<>Al aterrizar, tocá <Chip>Regreso al Hangar</Chip> y luego <Chip>Finalizar Vuelo</Chip></>}>
              <p className="man__step-text">Son dos clics seguidos, uno por cada etapa.</p>
            </Step>
            <Step n={5} title="Completá el Checklist Post-Vuelo">
              <p className="man__step-text">El botón <Chip variant="outline">Completar Checklist</Chip> aparece en cuanto el vuelo queda <Badge variant="verde">COMPLETADO</Badge>. Es obligatorio antes de poder ver el reporte.</p>
            </Step>
          </div>

          <SectionHead icon="bi-exclamation-triangle">Si el alumno no se presenta</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Tocá <Chip variant="danger">Inasistencia</Chip></>}>
              <p className="man__step-text">Disponible solo antes de marcar la salida del hangar, y no aplica a vuelos de simulador. El sistema te va a pedir el <strong>motivo de la inasistencia</strong>.</p>
              <p className="man__note man__note--warn"><i className="bi bi-exclamation-triangle" />Esta acción cierra el vuelo con 0 minutos — no se puede deshacer desde tu panel.</p>
            </Step>
          </div>

          <SectionHead icon="bi-clipboard2-check" hint="Se abre solo cuando el checklist post-vuelo ya está completo.">Llenar el Reporte de Vuelo</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Tocá <Chip variant="outline">Ver Reporte de Vuelo</Chip></>}>
              <p className="man__step-text">Vas a ver los datos generales precargados: reporte N°, hora, fecha, tipo y matrícula de la aeronave.</p>
            </Step>
            <Step n={2} title="Completá tacómetro, hobbs y combustible">
              <div className="man__tacho">
                <div><div className="k">Tacómetro salida</div><div className="v">0000.0</div></div>
                <div><div className="k">Tacómetro llegada</div><div className="v">0000.0</div></div>
                <div><div className="k">Hobbs salida</div><div className="v">0000.0</div></div>
                <div><div className="k">Hobbs llegada</div><div className="v">0000.0</div></div>
                <div><div className="k">Combustible salida</div><div className="v">0000.0</div></div>
                <div><div className="k">Combustible llegada</div><div className="v">0000.0</div></div>
              </div>
            </Step>
            <Step n={3} title="Firmá — vos primero, después el alumno">
              <p className="man__step-text">El reporte pasa por tres estados: <Badge variant="gris">Borrador</Badge> → <Badge variant="naranja">Pendiente instructor</Badge> → <Badge variant="naranja">Pendiente firma alumno</Badge> → <Badge variant="verde">Completado</Badge>. El vuelo se cobra automáticamente a la cuenta del alumno al cerrarse.</p>
            </Step>
          </div>

          <SectionHead icon="bi-exclamation-triangle" hint="Salió del hangar, se quedó en pista o volvió antes de despegar — el avión sí se movió, pero el vuelo como tal no ocurrió.">Regreso por emergencia: el avión se movió pero no se voló</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Anotá el TAC y el Hobbs reales igual que siempre">
              <p className="man__step-text">Aunque la diferencia sea mínima — es lo que mantiene al día el mantenimiento del avión. Esas horas <strong>sí</strong> cuentan para la aeronave.</p>
            </Step>
            <Step n={2} title={<>Activá <Chip variant="danger">Regreso por emergencia</Chip> y elegí el motivo</>}>
              <p className="man__step-text">Clima, Falla mecánica u Otro, con un detalle breve. El campo "horas a cobrar" desaparece solo: este vuelo <strong>no se cobra</strong>, no suma horas de licencia, no avanza tu curso y no te paga a vos en nómina.</p>
              <p className="man__note man__note--warn"><i className="bi bi-exclamation-triangle" />No aplica a simulador ni junto con Inasistencia — son casos distintos. Usalo solo cuando el avión salió a moverse pero el vuelo en sí no se hizo.</p>
            </Step>
            <Step n={3} title="Firmá y enviá normalmente">
              <p className="man__step-text">Podés guardarlo como borrador con la marca puesta y sigue ahí al reabrirlo. Una vez firmado, revisalo bien: <strong>no hay forma de deshacer</strong> la firma desde tu panel si te equivocaste.</p>
            </Step>
          </div>

          <SectionHead icon="bi-signpost-split" hint="Cuando la ruta que pediste el alumno tiene escala en otro aeropuerto.">Vuelos con escala (rutas con parada)</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Cada tramo es un vuelo propio, con su loadsheet y su vouchera">
              <p className="man__step-text">Ves la ruta completa en tu tarjeta ("Tramo 1/3 · MSSS→MGGT", etc.). El primer tramo sale del hangar y avanza como cualquier vuelo; los siguientes empiezan en <Badge variant="naranja">EN ESPERA DE TRAMO</Badge>.</p>
            </Step>
            <Step n={2} title="Al aterrizar en cada escala, completá el mini-formulario">
              <p className="man__step-text">Te pide solo <strong>TAC y Hobbs de llegada</strong> — pensado para hacerlo desde el teléfono en pista. Con eso cierra ese tramo y habilita el siguiente.</p>
            </Step>
            <Step n={3} title="El checklist post-vuelo va solo en el último tramo">
              <p className="man__step-text">Los tramos que cierran fuera de tu base no vuelven al hangar, así que no lo piden. El ciclo completo (Salida hangar → Regreso hangar → Finalizar) se hace normal en el tramo final.</p>
            </Step>
            <Step n={4} title="Si la ruta se corta a mitad de camino">
              <p className="man__step-text">Firmá la vouchera del tramo que sí volaste como <strong>Regreso anticipado</strong>, y pedile a Turno que cancele los tramos restantes desde su panel.</p>
            </Step>
          </div>

          <SectionHead icon="bi-geo-alt">Ver el loadsheet que te envía el alumno</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Buscá el botón <Chip variant="outline">Ver Loadsheet del alumno</Chip></>}>
              <p className="man__step-text">Aparece en la tarjeta del vuelo apenas el alumno hace clic en "Guardar y enviar" desde el suyo. Lo abrís en <strong>modo lectura</strong>: podés ver, imprimir y descargar el PDF, pero no editarlo.</p>
            </Step>
            <Step n={2} title={<>¿Querés practicar? Usá <Chip variant="outline">Practicar loadsheet</Chip> en tu menú</>}>
              <p className="man__step-text">Abre un loadsheet de prueba, sin vuelo real detrás — elegís cualquier aeronave libre, no se guarda ni se envía. Sirve para ensayar el cálculo sin afectar nada.</p>
            </Step>
          </div>

          <SectionHead icon="bi-headset" hint='Aparece como "Mis vuelos de práctica" en tu Dashboard, si aplica.'>Vuelos de práctica con otro instructor (CHEQUEO / REFRESH)</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Vos sos el que RECIBE la instrucción — el otro instructor va como PIC">
              <p className="man__step-text">Se agenda igual que cualquier vuelo, pero a tu propio nombre como practicante. Se avisa siempre en dos sub-tipos: <strong>CHEQUEO</strong> (lo paga la escuela) o <strong>REFRESH</strong> (lo pagás vos).</p>
            </Step>
            <Step n={2} title='Si es REFRESH, elegís si se debita de tu saldo al completarse'>
              <p className="man__step-text">Al pedirlo ves tu saldo y el costo estimado; el checkbox "Debitar de mi saldo" viene marcado por defecto si te alcanza. Nunca te bloquea el pedido ni te deja en saldo negativo — si al momento de cerrar el vuelo ya no te alcanza, simplemente no se cobra automático y queda pendiente de pago manual.</p>
            </Step>
            <Step n={3} title="Firmás el reporte como si fueras el alumno">
              <p className="man__step-text">Desde "Mis vuelos de práctica" abrís tu propio loadsheet y firmás tu propio reporte de vuelo, con los mismos pasos que ya conocés del lado del alumno.</p>
            </Step>
          </div>

          <SectionHead icon="bi-calendar-event" hint="Aparece en tu menú si sos instructor de teoría.">Agenda de teoría: tus clases en salón</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Entrá a <Chip><i className="bi bi-calendar-event" />Agenda de teoría</Chip> desde el menú</>}>
              <p className="man__step-text">Ves un día a la vez (lo cambiás con el selector de fecha), el panel <strong>Salones de teoría</strong> con la ocupación en vivo, y tus clases de ese día con su estado.</p>
            </Step>
            <Step n={2} title={<>Tocá <Chip>+ Agendar clase</Chip></>}>
              <p className="man__step-text">Elegís <strong>curso</strong> (y unidad, si aplica), <strong>fecha</strong>, <strong>bloque de inicio y fin</strong> (los mismos bloques horarios de los vuelos), <strong>salón</strong> y <strong>los alumnos</strong> que asistirán — al menos uno (la lista es la misma de todos los alumnos activos que ves al agendar vuelos). También podés marcar si habrá examen y anotar el tema.</p>
              <p className="man__note man__note--info"><i className="bi bi-info-circle" />Los salones ocupados salen deshabilitados con el motivo. El sistema tampoco deja agendar si vos ya tenés otra clase <strong>o un vuelo</strong> en ese horario.</p>
            </Step>
            <Step n={3} title={<>El día de la clase: <Chip>Iniciar clase</Chip>, y al terminar, <Chip>Cerrar clase</Chip></>}>
              <p className="man__step-text">La clase pasa por <Badge variant="gris">PROGRAMADA</Badge> → <Badge variant="naranja">EN CURSO</Badge> → <Badge variant="verde">CERRADA</Badge>. Al iniciarla, el salón se marca "EN SESIÓN" en todos los paneles y el staff recibe una notificación. <Chip variant="danger">Cancelar</Chip> solo está disponible mientras la clase sigue programada — una vez iniciada, se cierra, no se cancela.</p>
            </Step>
            <Step n={4} title="La asistencia se firma después de cerrar">
              <p className="man__step-text">Los alumnos que elegiste al agendar quedan precargados como presentes; si hace falta corregir (ausente, tarde, justificado), pasás lista desde <strong>Aula Virtual → Asistencia</strong>. Al cerrar la clase, cada alumno presente <strong>firma digitalmente</strong> su asistencia desde su propia cuenta, en la pestaña "Mis clases".</p>
            </Step>
          </div>

          <SectionHead icon="bi-mortarboard">Otras tareas frecuentes</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Editar el límite semanal de tus alumnos">
              <p className="man__step-text">Desde tu Dashboard, en la fila de cada alumno podés ajustar su límite de vuelos de avión y de simulador (0 a 6) sin depender de que sea "la semana próxima".</p>
            </Step>
            <Step n={2} title="Aula Virtual">
              <p className="man__step-text">Tres pestañas: <span className="man__tabs" style={{ display: "inline-flex", verticalAlign: "middle" }}><span className="on">Material</span><span>Evaluaciones</span><span>Asistencia</span></span>. Subís material por unidad, calificás exámenes alumno por alumno (botón <Chip variant="outline">Calificar</Chip>) y pasás lista de asistencia por sesión. Las clases en sí se agendan, inician y cierran desde <strong>Agenda de teoría</strong>.</p>
            </Step>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── TURNO ───────── */}
        <section className={`man__page ${active === "turno" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-megaphone" />Manual 03</div>
          <h1 className="man__title">Turno</h1>
          <p className="man__lede">Sos el respaldo operativo del día: abrís y cerrás el turno, seguís el estado de todos los vuelos, mantenés informados a todos por el ticker, y cerrás el día con el reporte de vuelos por avión.</p>
          <div className="man__strip"><span>Abrir / cerrar turno</span><span>Vuelos del día</span><span>Agenda de teoría</span><span>Operaciones</span><span>Mantenimiento</span><span>Ticker</span><span>Reporte del día</span></div>

          <SectionHead icon="bi-sunrise" hint="Cada acción queda registrada con su hora exacta y quién la marcó — es la bitácora oficial de la jornada.">El ciclo del turno: apertura, almuerzo, cambio y cierre</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Al iniciar el día: tocá <Chip>Abrir turno</Chip> y marcá a los instructores presentes</>}>
              <p className="man__step-text">En la barra <strong>Turno del día</strong>, arriba de tu dashboard. Seleccionás de la lista a los instructores del turno de la mañana (usualmente dos) — se registra la hora de apertura y la <strong>entrada</strong> de cada uno. La proyección pasa a mostrar <Badge variant="verde">TURNO ABIERTO</Badge> con sus nombres.</p>
            </Step>
            <Step n={2} title={<>A mediodía: <Chip variant="secondary">Pausa almuerzo</Chip> y luego <Chip>Reanudar</Chip></>}>
              <p className="man__step-text">La pausa (usualmente de 12:00 a 1:30 pm) <strong>no finaliza el turno</strong> — solo lo marca en pausa con su hora real. En la proyección se ve "TURNO EN PAUSA · ALMUERZO".</p>
            </Step>
            <Step n={3} title={<>Cuando entra la tarde: <Chip variant="secondary">Cambio de turno</Chip></>}>
              <p className="man__step-text">Marca automáticamente la <strong>salida</strong> de los instructores de la mañana y te pide seleccionar a los de la tarde, que quedan con su <strong>entrada</strong> registrada. En la barra ves a ambos grupos con sus horarios (los que ya salieron aparecen atenuados).</p>
            </Step>
            <Step n={4} title={<>Al final del día: <Chip>Cerrar turno</Chip></>}>
              <p className="man__step-text">Registra la hora de cierre y la salida de todos los que sigan presentes. Si se cerró por error, <Chip variant="ghost">Reabrir turno</Chip> lo reactiva sin perder los registros.</p>
              <p className="man__note man__note--info"><i className="bi bi-info-circle" />Esto es independiente de "Suspender operaciones" (que es para clima o emergencias y cancela vuelos). Abrir o cerrar el turno <strong>no cancela ningún vuelo</strong>.</p>
            </Step>
          </div>

          <SectionHead icon="bi-arrow-repeat" hint={<>Mismo ciclo de vida que usa el instructor — ver <a href="#ciclo" onClick={(e) => { e.preventDefault(); go("ciclo"); }}>la página de referencia</a>.</>}>Vuelos del día</SectionHead>
          <div className="man__steps">
            <Step n={1} title='Revisá el contador de "vuelos activos" en tu Dashboard operativo'>
              <p className="man__step-text">Te da una foto rápida de cuántos vuelos siguen abiertos en este momento.</p>
            </Step>
            <Step n={2} title="Avanzá un vuelo solo si el instructor no lo hizo">
              <p className="man__step-text">Cada tarjeta tiene el mismo botón de avance (<Chip>→ Salida hangar</Chip>, etc.). Es un respaldo — el instructor es quien normalmente marca su propio vuelo.</p>
            </Step>
            <Step n={3} title="Editá la tripulación si hace falta">
              <p className="man__step-text">El ícono de lápiz en la tarjeta abre el editor de <strong>alumno, instructor, aeronave y almas a bordo</strong>. En una ruta con escala, cambiar instructor o aeronave se aplica a <strong>todos los tramos</strong> a la vez.</p>
              <p className="man__note man__note--info"><i className="bi bi-info-circle" />Una ruta con escala no se puede mover de día — partiría el viaje en dos fechas y dejaría el regreso sin poder volarse. Si hace falta reprogramarla, cancelá la ruta completa y volvela a agendar.</p>
            </Step>
            <Step n={4} title='Si una ruta con escala se corta a mitad de camino: "Cancelar tramos restantes"'>
              <p className="man__step-text">Disponible en la tarjeta del vuelo cuando hay tramos todavía sin volar. Cancela solo lo que falta — el tramo ya volado (con su vouchera firmada) queda intacto.</p>
            </Step>
          </div>

          <SectionHead icon="bi-geo-alt" hint="Esto es lo que ve toda la escuela en la pantalla de proyección.">Estado de Operaciones</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Para suspender: tocá <Chip variant="secondary">Suspender operaciones</Chip></>}>
              <p className="man__step-text">Te pide un motivo (clima, mantenimiento de pista, etc.) y podés elegir qué bloques horarios quedan suspendidos.</p>
            </Step>
            <Step n={2} title={<>Para reactivar: <Chip variant="secondary">Gestionar suspensión</Chip> o <Chip>Reanudar operaciones</Chip></>}>
              <p className="man__step-text">"Gestionar" ajusta qué bloques siguen suspendidos; "Reanudar" reactiva todo de una vez (te pide confirmación).</p>
            </Step>
          </div>

          <SectionHead icon="bi-calendar-event" hint='En tu dashboard, sección "Agenda de teoría — hoy".'>Agenda de teoría y salones</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Agendá una clase a nombre de un instructor: <Chip>Agendar clase</Chip></>}>
              <p className="man__step-text">Es el mismo formulario que usa el instructor, con un selector extra de <strong>Instructor</strong> (solo aparecen los habilitados para teoría). Elegís curso, fecha, bloques horarios, salón y alumnos; el sistema valida choques del salón y del instructor — incluidos <strong>sus vuelos</strong> de ese horario.</p>
            </Step>
            <Step n={2} title={<>Bloqueá un salón sin clase: <Chip variant="secondary">Reservar salón</Chip></>}>
              <p className="man__step-text">Para usos especiales: <strong>Reunión, Evento, Administrativo u Otro</strong>, con fecha, bloques y una descripción opcional. La reserva bloquea el salón igual que una clase y se ve como <Badge variant="naranja">Reservado</Badge> en el panel de salones.</p>
            </Step>
            <Step n={3} title="Reasignar salón o cancelar una clase">
              <p className="man__step-text"><Chip variant="ghost">Reasignar salón</Chip> mueve la clase a otro salón libre (disponible mientras está programada o en curso). <Chip variant="danger">Cancelar</Chip> solo aplica a clases que aún no iniciaron. Iniciar y cerrar la clase le corresponde al instructor.</p>
            </Step>
            <Step n={4} title='Monitoreá el panel "Salones de teoría"'>
              <p className="man__step-text">Cada salón muestra su estado en vivo: <Badge variant="rojo">EN SESIÓN</Badge> (con instructor y curso), <Badge variant="naranja">Reservado</Badge>, <Badge variant="azul">Próxima</Badge> (la siguiente clase del día) o <Badge variant="verde">Libre</Badge>. Se actualiza solo, y el mismo panel se ve en Proyección, Programación y Admin.</p>
            </Step>
          </div>

          <SectionHead icon="bi-tools" hint="Para fallas detectadas en la inspección pre-vuelo o reportadas por taller a mitad del día.">Aeronave a mantenimiento imprevisto</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>En "Estado de la flota", tocá <Chip variant="secondary">Aeronave a mantenimiento</Chip></>}>
              <p className="man__step-text">El widget muestra cada avión con su estado: <Badge variant="verde">Operativa</Badge> o <Badge variant="naranja">Mantenimiento</Badge>. El botón abre el formulario para sacar una de servicio.</p>
            </Step>
            <Step n={2} title="Elegí la aeronave, describí la falla y cerrá sus bloques">
              <p className="man__step-text">Escribís lo que reportó taller, marcás los <strong>bloques de hoy</strong> que se cierran para esa aeronave y, si taller estima varios días, la <strong>fecha de reintegro</strong> (eso cierra también esos días completos). Antes de confirmar ves la lista exacta de vuelos que se cancelarán.</p>
            </Step>
            <Step n={3} title="Confirmá — el sistema hace el resto">
              <p className="man__step-text">La aeronave pasa a <Badge variant="naranja">MANTENIMIENTO</Badge> (sale de la disponibilidad de agendado y se ve en rojo en la proyección), se cancelan sus vuelos afectados, y <strong>cada tripulación (alumno e instructor) recibe notificación</strong> en la app y por correo. Además se publica un aviso automático en el ticker.</p>
            </Step>
            <Step n={4} title={<>Cuando taller termina: <Chip>Marcar operativa</Chip></>}>
              <p className="man__step-text">El botón aparece en el chip de la aeronave en mantenimiento. La reactiva, vuelve a estar disponible para agendar y su aviso del ticker se limpia solo.</p>
            </Step>
          </div>

          <SectionHead icon="bi-megaphone">Publicar un aviso en el ticker</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Escribí el mensaje y tocá <Chip>Publicar</Chip></>}>
              <p className="man__step-text">Aparece de inmediato en la barra de avisos de todos los paneles y en la pantalla de proyección. Máximo 200 caracteres.</p>
            </Step>
            <Step n={2} title="Borralo cuando ya no aplique">
              <p className="man__step-text">Con la <strong>×</strong> junto al aviso, o <Chip variant="ghost">Limpiar todos</Chip> para vaciar la lista completa.</p>
            </Step>
          </div>

          <SectionHead icon="bi-clipboard2-check">Cerrar el día</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Elegí la fecha y tocá <Chip>Reporte del día</Chip></>}>
              <p className="man__step-text">Genera un PDF con los vuelos completados de ese día, agrupados por avión: alumno, instructor y horas de cada vuelo, con totales por aeronave. No incluye montos — el reporte con montos lo saca Administración desde su propio panel.</p>
            </Step>
            <Step n={2} title="¿Se te olvidó agendar un vuelo esta semana?">
              <p className="man__step-text">Tocá <Chip variant="secondary">Agendar vuelo</Chip> junto al reporte — agrega un vuelo omitido sin tener que ir al módulo de Programación.</p>
            </Step>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── PROGRAMACIÓN ───────── */}
        <section className={`man__page ${active === "programacion" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-grid-3x3-gap" />Manual 04</div>
          <h1 className="man__title">Programación</h1>
          <p className="man__lede">Tu semana consiste en armar el rompecabezas de aeronaves, instructores y alumnos — y dejarlo listo para que Admin lo publique.</p>
          <div className="man__strip"><span>Calendario</span><span>Asignar</span><span>Guardar</span><span>Agendar directo</span></div>

          <SectionHead icon="bi-grid-3x3-gap">Organizar el calendario semanal</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Elegí la semana: <span className="man__tabs" style={{ display: "inline-flex", verticalAlign: "middle" }}><span className="on">Actual</span><span>Próxima</span></span></>}>
              <p className="man__step-text">La semana <strong>Actual</strong> es para monitoreo y ajustes de última hora; la <strong>Próxima</strong> es donde organizás con más margen las solicitudes que llegan de los alumnos.</p>
            </Step>
            <Step n={2} title="Arrastrá los vuelos entre horarios y aeronaves">
              <p className="man__step-text">El panel de arriba muestra <strong>Vuelos Programados</strong>, <strong>Aeronaves Activas</strong> y <strong>Cambios Pendientes</strong> — así sabés de un vistazo qué te falta guardar.</p>
            </Step>
            <Step n={3} title="Resolvé los conflictos antes de guardar">
              <p className="man__step-text">Si dos vuelos quedan asignados a la misma aeronave o el mismo instructor en el mismo horario, el sistema no te va a dejar publicar la semana hasta que lo arregles.</p>
            </Step>
            <Step n={4} title={<>Tocá <Chip>Guardar (N)</Chip></>}>
              <p className="man__step-text">El número entre paréntesis son tus cambios pendientes. <Chip variant="secondary">Deshacer</Chip> los descarta todos sin guardar nada.</p>
              <p className="man__note man__note--info"><i className="bi bi-info-circle" />Guardar organiza la semana, pero <strong>publicarla</strong> (hacerla visible para los alumnos) lo hace Admin desde su propio panel.</p>
            </Step>
          </div>

          <SectionHead icon="bi-mortarboard" hint="Útil cuando un alumno llama o escribe pidiendo un espacio puntual.">Agendar un vuelo directamente para un alumno</SectionHead>
          <div className="man__steps">
            <Step n={1} title={'Entrá a "Agendar Vuelos para Alumno"'}>
              <p className="man__step-text">Elegí el alumno y el instructor, y seleccioná los horarios igual que en la grilla del alumno — pero sin pasar por la revisión: queda agendado directamente.</p>
            </Step>
            <Step n={2} title='Si el vuelo tiene escala, marcá "Con parada"'>
              <p className="man__step-text">Agregá hasta 4 aeropuertos intermedios (código ICAO de 4 letras) entre tu base y el regreso. El sistema reparte el horario en tramos iguales y valida que ni el avión ni el instructor choquen en ninguno de ellos.</p>
            </Step>
            <Step n={3} title='Asignar un alumno distinto a cada tramo'>
              <p className="man__step-text">Útil cuando la ida la vuela un alumno y el retorno otro (mismo instructor). Desde el popover de un vuelo con escala ya publicado, "Asignar alumnos por tramo" te deja elegir uno por tramo.</p>
            </Step>
          </div>

          <div className="man__callout">
            <h4><i className="bi bi-cash-coin" />Badge "$" en el calendario</h4>
            <p>Un vuelo cuyo alumno no tiene saldo suficiente para cubrirlo sale marcado con una etiqueta ámbar — es solo un aviso, no bloquea el agendado.</p>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── ADMINISTRACIÓN ───────── */}
        <section className={`man__page ${active === "administracion" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-cash-coin" />Manual 05</div>
          <h1 className="man__title">Administración</h1>
          <p className="man__lede">Todo lo financiero y administrativo de la academia: cuentas de alumnos, usuarios del sistema, cursos, documentación y reportes.</p>
          <div className="man__strip"><span>Usuarios</span><span>Cuenta corriente</span><span>Contabilidad</span><span>Cursos y documentos</span></div>

          <div className="man__callout">
            <h4><i className="bi bi-info-circle" />Tu menú lateral</h4>
            <p>Ocho secciones: Dashboard, Usuarios, Alumnos, Contabilidad, Cursos, Documentación, Médicos AAC, Aula Virtual y Reportes.</p>
          </div>

          <SectionHead icon="bi-mortarboard">Crear un usuario nuevo</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Entrá a Usuarios y elegí la pestaña correcta">
              <div className="man__ui"><span className="man__tabs"><span className="on">Alumnos</span><span>Personal</span></span></div>
            </Step>
            <Step n={2} title={<>Alumno nuevo: tocá <Chip>Nuevo alumno</Chip></>}>
              <p className="man__step-text">Se crea su usuario, su ficha de alumno (con instructor y licencia asignados) y su cuenta corriente en $0.</p>
            </Step>
            <Step n={3} title={<>Personal nuevo: tocá <Chip>Nuevo personal</Chip></>}>
              <p className="man__step-text">Elegís el rol (instructor, turno, programación, etc.). Si es instructor, su ficha se crea automáticamente. El nuevo usuario debe cambiar su contraseña en el primer ingreso.</p>
            </Step>
          </div>

          <SectionHead icon="bi-cash-coin" hint="El modelo es de saldo prepagado: los depósitos suman, los vuelos y cargos restan.">Cuenta corriente de un alumno</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Abrí la ficha del alumno desde Alumnos y elegí qué registrar">
              <div className="man__ui">
                <Chip variant="positive">+ Registrar abono (Haber)</Chip>
                <Chip variant="secondary">− Cargo manual (Debe)</Chip>
                <Chip variant="secondary">Multa (no-show)</Chip>
                <Chip variant="secondary">Cobrar concepto</Chip>
              </div>
            </Step>
            <Step n={2} title={<>Un depósito es un <strong>Registrar abono</strong>; un cobro de examen o material es <strong>Cobrar concepto</strong></>}>
              <p className="man__step-text">"Cobrar concepto" usa el catálogo configurado en Contabilidad (ej. "Reposición de examen"), así el monto siempre es consistente.</p>
            </Step>
            <Step n={3} title="El extracto se comporta como una hoja de Excel">
              <p className="man__step-text">Si metés un movimiento con fecha anterior, el saldo de <strong>todas las filas de abajo se recalcula solo</strong> — ya no queda congelado en el número de cuando se creó.</p>
            </Step>
            <Step n={4} title={<>¿Te equivocaste de movimiento? <Chip variant="danger"><i className="bi bi-trash" /></Chip></>}>
              <p className="man__step-text">El ícono de papelera lo borra de verdad (no queda una fila de "anulación" en el historial). Si el movimiento tenía un recibo o factura ligado, te pregunta si también querés borrar ese documento.</p>
            </Step>
          </div>

          <SectionHead icon="bi-airplane" hint="Para cuando un alumno tiene un acuerdo distinto al precio de lista.">Precios especiales por avión</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Desde <strong>Contabilidad → Tarifas</strong>, botón <Chip variant="secondary">Precios</Chip> en la fila del avión</>}>
              <p className="man__step-text">Ahí creás y editás montos especiales (a diferencia de la tarifa estándar, estos no llevan historial por fecha — son un monto fijo que editás cuando cambie).</p>
            </Step>
            <Step n={2} title={<>Asignaselo al alumno desde su ficha, pestaña <strong>"Precios por avión"</strong></>}>
              <p className="man__step-text">Al cerrar un vuelo de ese alumno en ese avión, el sistema cobra el precio especial en vez del estándar. Quitarle la asignación lo devuelve al precio de lista.</p>
            </Step>
          </div>

          <div className="man__callout">
            <h4><i className="bi bi-clock-history" />Horas totales acumuladas</h4>
            <p>En la ficha del alumno (pestaña Perfil) podés editar directamente sus <strong>horas totales acumuladas</strong> — útil para setear el punto de partida de un alumno que viene con horas de otra escuela o de antes de usar el sistema.</p>
          </div>

          <SectionHead icon="bi-clipboard2-check">Contabilidad, cursos y documentación</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Contabilidad agrupa Ingresos, Egresos, Nómina y Tarifas en una sola pantalla con sub-pestañas." />
            <Step n={2} title="Cursos y Aula Virtual controlan el contenido teórico; Documentación y Médicos AAC llevan el expediente de cada alumno." />
            <Step n={3} title="Reportes reúne los informes generales: horas voladas, cursos completados, historial de planillas." />
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── TALLER ───────── */}
        <section className={`man__page ${active === "taller" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-tools" />Manual 06</div>
          <h1 className="man__title">Taller</h1>
          <p className="man__lede">Todo gira alrededor de <strong>Mi taller</strong>: ahí aparece qué avión estás trabajando, qué le falta, y los cuatro botones que usás todo el día. Este manual te sirve seas <strong>mecánico (rol Técnico)</strong> o <strong>jefe de taller</strong> — las diferencias están marcadas.</p>
          <div className="man__strip"><span>Mi taller</span><span>Orden de trabajo</span><span>Requisición</span><span>Solicitud</span><span>Préstamos</span><span>Inventario</span><span>Libros del avión</span><span>Aeronavegabilidad</span><span>Revisar y aprobar</span></div>

          <div className="man__callout">
            <h4><i className="bi bi-award" />Para firmar necesitás tu licencia TMA cargada</h4>
            <p>Sin ella, el botón de firmar te va a rechazar con un error. Pedile a Administración que la cargue desde tu ficha de usuario (número TMA + certificado de aprendiz, si aplica) — es lo que respalda legalmente tu firma en la orden.</p>
          </div>

          <SectionHead icon="bi-house-gear" hint="Es la primera pantalla que ves al entrar — pensada para el teléfono.">Tu pantalla principal: Mi taller</SectionHead>
          <div className="man__steps">
            <Step n={1} title='Arriba: "El taller ahora" — los aviones que tienen trabajo abierto'>
              <p className="man__step-text">Cada tarjeta muestra quién está adentro, el tacómetro, un cronómetro del tiempo trabajado, el material que se pidió (con botón para despacharlo ahí mismo) y — si sos jefe — un selector para reasignar el mecánico.</p>
            </Step>
            <Step n={2} title="Abajo: tus cuatro botones">
              <div className="man__ui">
                <Chip variant="primary"><i className="bi bi-tools" /> Iniciar un mantenimiento</Chip>
                <Chip variant="secondary"><i className="bi bi-box-seam" /> Pedir material</Chip>
                <Chip variant="secondary"><i className="bi bi-droplet" /> Sacar aceite</Chip>
                <Chip variant="positive-fill"><i className="bi bi-pen" /> Firmar mi trabajo</Chip>
              </div>
              <p className="man__step-text" style={{ marginTop: 10 }}>Con un trabajo en curso, el botón relleno cambia a <strong>"Terminé — mandar a revisión"</strong>: siempre es lo próximo que corresponde hacer.</p>
            </Step>
            <Step n={3} title="Tocar un avión hace lo que corresponda según quién sos">
              <p className="man__step-text">Si el trabajo es tuyo, te lleva a tu tarjeta. Si está <Badge variant="naranja">Esperando tu firma</Badge> (jefe), te abre la revisión. El resto los podés mirar, sin poder tocarlos.</p>
            </Step>
          </div>

          <SectionHead icon="bi-arrow-repeat" hint="Operaciones (Turno/Admin) es quien manda el avión a mantenimiento — el Taller nunca inicia eso.">El circuito completo de una orden de trabajo</SectionHead>
          <div className="man__legend-wrap">
            <table className="man__legend">
              <thead><tr><th>Paso</th><th>Qué pasa</th><th>Quién</th></tr></thead>
              <tbody>
                <tr><td>1</td><td>El avión entra a mantenimiento y aparece en tu cola, "Aviones esperando trabajo".</td><td>Operaciones lo manda</td></tr>
                <tr><td>2</td><td>Tocás <Chip variant="secondary">Iniciar un mantenimiento</Chip> en ese avión (o el jefe te lo asigna).</td><td>Vos</td></tr>
                <tr><td>3</td><td>Se abre su orden de trabajo, con correlativo propio (ej. <code>CAAA/2026-0049</code>). De ahí cuelga todo el papeleo.</td><td>Automático</td></tr>
                <tr><td>4</td><td>Pedís material, trabajás, y cuando termines tocás <Chip>Terminé — mandar a revisión</Chip>.</td><td>Vos</td></tr>
                <tr><td>5</td><td>El jefe revisa: <Chip variant="positive">Aprobar</Chip> o la devuelve con una nota si falta algo.</td><td>Jefe de taller</td></tr>
                <tr><td>6</td><td>Cuando ya no queda ninguna orden pendiente de ese avión, se avisa a Operaciones "listo para devolver".</td><td>Automático</td></tr>
                <tr><td>7</td><td>Operaciones cierra el mantenimiento y el avión vuelve a estar disponible.</td><td>Turno/Admin</td></tr>
              </tbody>
            </table>
          </div>
          <p className="man__note man__note--info"><i className="bi bi-info-circle" />Un avión puede llevar varias órdenes abiertas a la vez (ej. una inspección grande con varios mecánicos). No se libera hasta que todas queden aprobadas.</p>

          <SectionHead icon="bi-box-seam" hint="Tres papeles, tres momentos — así lo pide la AAC.">Pedir material: requisición → solicitud → retorno</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Anotá lo que vas a necesitar: <Chip variant="secondary">Pedir material</Chip> → Requisición</>}>
              <p className="man__step-text">Es un borrador — <strong>no descarga nada del inventario todavía</strong>. Es el único de los tres documentos que podés editar después de creado.</p>
            </Step>
            <Step n={2} title="La solicitud es la que de verdad descarga el almacén">
              <p className="man__step-text">Lleva el número de orden de trabajo, quién entrega y quién recibe — y ambos <strong>firman en pantalla</strong> (igual que la firma de una vouchera). El PDF sale del sistema ya firmado.</p>
            </Step>
            <Step n={3} title="Si sobró material, se registra el retorno">
              <p className="man__step-text">Suma de vuelta al inventario con su fecha real de devolución.</p>
            </Step>
          </div>

          <SectionHead icon="bi-arrow-left-right" hint="Con otro taller del aeropuerto — en cualquiera de las dos direcciones.">Préstamo de partes</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Elegí primero la dirección: Recibido o Entregado">
              <p className="man__step-text">Define todo lo demás. Si <strong>nos prestan</strong> algo, suma a tu existencia; si <strong>vos prestás</strong>, resta. Anotá la contraparte y, si aplica, una fecha comprometida de devolución.</p>
            </Step>
            <Step n={2} title="La devolución puede ser parcial">
              <p className="man__step-text">Anotás lo que volvió y el préstamo sigue abierto por el resto. Si se pagó o se cruzó en cuenta sin devolver la parte física, usá "Cerrar sin devolución" — no mueve inventario.</p>
            </Step>
            <Step n={3} title="Los vencidos salen marcados en rojo">
              <p className="man__step-text">Pasó la fecha comprometida, o lleva más de un mes afuera sin fecha.</p>
            </Step>
          </div>

          <SectionHead icon="bi-boxes" hint="Reorganizado por lo que hacés, no por el nombre del papel.">Inventario</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Existencias, Entradas, Salidas, Aceites, Préstamos, Consumo por aeronave y Costos pendientes">
              <p className="man__step-text">Cada pestaña es una acción de bodega. Una <strong>entrada</strong> con costo genera su egreso en Contabilidad automáticamente; una <strong>salida</strong> se cuelga opcionalmente de una orden de trabajo o de un mantenimiento.</p>
            </Step>
            <Step n={2} title="Hacé clic en cualquier ítem para ver su kardex">
              <p className="man__step-text">El saldo corrido de ese repuesto, movimiento por movimiento — igual que el extracto de una cuenta corriente.</p>
            </Step>
            <Step n={3} title={<>Si no alcanza la existencia, el sistema avisa <strong>409</strong></>}>
              <p className="man__step-text">Salvo que tengas permiso para forzarlo (con motivo escrito) — pedile a Administración ese permiso si lo necesitás seguido.</p>
            </Step>
          </div>

          <SectionHead icon="bi-journal-text" hint="Los tres libros físicos que exige la AAC: célula, motor y hélice.">Libros del avión y stickers</SectionHead>
          <div className="man__steps">
            <Step n={1} title='Desde una orden de trabajo: "Emitir stickers"'>
              <p className="man__step-text">Elegís sobre qué libro(s) trabajaste, el tipo (inspección, AD, SB…) y el texto. El sistema calcula el <strong>T.T. (Tiempo Total)</strong> y el <strong>TSO</strong> de esa parte y los imprime — junto con dos mini-stickers de próxima inspección.</p>
            </Step>
            <Step n={2} title='Consultá "Libros del avión" para ver el historial completo de cada parte'>
              <p className="man__step-text">Célula, motor y hélice por separado, con su ficha (marca, modelo, número de serie) y la lista cronológica de stickers.</p>
            </Step>
            <Step n={3} title="Si una parte no tiene anclaje, el sistema no inventa un número">
              <p className="man__step-text">Dice "sin anclaje: dictalo del libro" — hay que transcribir el T.T. real del papel una vez para que el sistema pueda seguir calculando desde ahí.</p>
            </Step>
          </div>

          <SectionHead icon="bi-tools">Aeronavegabilidad — componentes, ADs y vida límite</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Elegí la aeronave y revisá sus estados">
              <div className="man__ui">
                <Badge variant="verde">VIGENTE</Badge>
                <Badge variant="naranja">PRÓXIMO</Badge>
                <Badge variant="rojo">VENCIDO</Badge>
                <Badge variant="gris">N/A</Badge>
              </div>
            </Step>
            <Step n={2} title={<>Agregá componentes y tareas con <Chip variant="secondary">+ Componente</Chip> / <Chip variant="secondary">+ Tarea</Chip></>}>
              <p className="man__step-text">Las tareas pueden vencer por horas de vuelo, ciclos o fecha calendario — incluidas las <strong>directivas de aeronavegabilidad (AD)</strong>, boletines de servicio y vida límite de componentes, todo en la misma pantalla.</p>
            </Step>
            <Step n={3} title={<>Cuando se realice el trabajo, tocá <Chip variant="secondary">Cumplir</Chip></>}>
              <p className="man__step-text">Reinicia el reloj de esa tarea desde cero — el próximo vencimiento se recalcula automáticamente. Los avisos de vencimiento salen con 10 horas de vuelo, 7 días o 30 días de anticipación, según lo que corresponda.</p>
            </Step>
          </div>

          <SectionHead icon="bi-clipboard2-check" hint="Solo lo ve y lo usa el jefe de taller.">Si sos el jefe de taller</SectionHead>
          <div className="man__steps">
            <Step n={1} title='"Esperando tu firma" arriba de todo en Mi taller'>
              <p className="man__step-text">Todas las órdenes que sus mecánicos ya firmaron y esperan tu revisión, sin importar si el avión ya salió del hangar.</p>
            </Step>
            <Step n={2} title={<>Revisala y tocá <Chip variant="positive">Aprobar</Chip>, o devolvela con una nota</>}>
              <p className="man__step-text">Si la devolvés, vuelve a <Badge variant="gris">ABIERTA</Badge> y tu mecánico ve la nota en su pantalla.</p>
            </Step>
            <Step n={3} title="Asigná mecánicos y movés la fecha estimada de un mantenimiento">
              <p className="man__step-text">Desde el avión en la cola, "¿Cuándo está listo?". <strong>Siempre te muestra antes una vista previa</strong> de qué vuelos se cancelarían con esa fecha — mover una fecha puede afectarle el horario a varios alumnos.</p>
            </Step>
            <Step n={4} title="En Trabajos: el archivo completo por avión">
              <p className="man__step-text">Buscador de órdenes y el folder de cada aeronave con todo su papeleo junto — reporte de inspección, requisiciones, solicitudes, retornos y partes reemplazadas.</p>
            </Step>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── ADMIN ───────── */}
        <section className={`man__page ${active === "admin" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-shield-check" />Manual 07</div>
          <h1 className="man__title">Admin</h1>
          <p className="man__lede">Sos el super-usuario: tenés acceso a Operaciones, Administración y Taller desde un mismo panel, y sos quien publica la semana organizada por Programación.</p>
          <div className="man__strip"><span>3 secciones</span><span>Publicar semana</span><span>Mantenimiento</span></div>

          <SectionHead icon="bi-shield-check">Tu panel unificado</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Tu menú lateral tiene tres bloques: Operaciones, Administración y Taller">
              <p className="man__step-text">Podés operar cualquiera de los tres sin cambiar de usuario — es el único rol con esta vista combinada.</p>
            </Step>
            <Step n={2} title="Publicar la semana">
              <p className="man__step-text">Cuando Programación termina de organizar el calendario, tocás <Chip>Publicar Semana</Chip> desde tu Dashboard para que los vuelos se vuelvan visibles para los alumnos y su instructor.</p>
              <p className="man__note man__note--warn"><i className="bi bi-exclamation-triangle" />El sistema bloquea la publicación si quedan conflictos de aeronave o instructor sin resolver.</p>
            </Step>
            <Step n={3} title="Mantenimiento y Auditoría">
              <p className="man__step-text">Vistas de solo consulta para revisar el estado general de la flota y la actividad del sistema.</p>
            </Step>
            <Step n={4} title="Tu sección Taller es la misma que la del jefe de taller">
              <p className="man__step-text">Incluye <strong>Mi taller</strong> y <strong>Trabajos</strong> con exactamente las mismas pantallas — ver el <a href="#taller" onClick={(e) => { e.preventDefault(); go("taller"); }}>manual de Taller</a> para el circuito completo. Además tenés Aeronaves y Mantenimiento, que son solo tuyas.</p>
            </Step>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>
      </main>
    </div>
  );
}
