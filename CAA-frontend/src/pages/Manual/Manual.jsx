import { useEffect, useState } from "react";
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
  { id: "turno", icon: "bi-megaphone", title: "Turno", text: "Monitorear los vuelos del día, publicar avisos y generar el reporte de cierre." },
  { id: "programacion", icon: "bi-grid-3x3-gap", title: "Programación", text: "Organizar el calendario semanal, asignar aeronaves y resolver conflictos de horario." },
  { id: "administracion", icon: "bi-cash-coin", title: "Administración", text: "Cuentas corrientes, contabilidad, usuarios, cursos y documentación de alumnos." },
  { id: "taller", icon: "bi-tools", title: "Taller", text: "Aeronavegabilidad, mantenimientos programados e inventario de repuestos." },
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

export default function Manual() {
  const [active, setActive] = useState("portada");

  useEffect(() => {
    const h = (window.location.hash || "").replace("#", "");
    if (h) setActive(h);
  }, []);

  const go = (id) => {
    setActive(id);
    window.scrollTo(0, 0);
    try { history.replaceState(null, "", "#" + id); } catch { /* noop */ }
  };

  return (
    <div className="man__shell">
      <nav className="man__rail" aria-label="Manuales por rol">
        <div className="man__brand">
          <div className="man__brand-mark"><img src="/iso-caaa-white.png" alt="CAAA" /></div>
          <div>
            <div className="man__brand-title">CAAA</div>
            <div className="man__brand-sub">Manual de usuario</div>
          </div>
        </div>

        {NAV.map((g) => (
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
          <p>CAAA · Ilopango, El Salvador</p>
        </div>
      </nav>

      <main>
        {/* ───────── PORTADA ───────── */}
        <section className={`man__page ${active === "portada" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-journal-bookmark" />Guía general</div>
          <h1 className="man__title">Manual de usuario del sistema CAAA</h1>
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
              <p className="man__step-text">Cada casilla es una combinación de <strong>hora + aeronave + día</strong>. Hacé clic en las que digan "Disponible para agendar" hasta llegar a tu límite semanal (máximo un avión por día).</p>
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
            <Step n={4} title={<>Hacé clic en <Chip>Guardar (N vuelos)</Chip></>}>
              <p className="man__step-text">El botón muestra cuántos vuelos llevás seleccionados. Tu solicitud queda <strong>en revisión</strong>: Programación la organiza en el calendario y, cuando la publique, tus vuelos aparecen en tu horario con estado <Badge variant="gris">PROGRAMADO</Badge>.</p>
              <p className="man__note man__note--info"><i className="bi bi-info-circle" />Guardar no confirma el vuelo al instante — es una solicitud. Revisá tu horario más tarde para ver qué quedó publicado.</p>
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
          <div className="man__strip"><span>Marcar vuelo</span><span>Inasistencia</span><span>Checklist</span><span>Reporte</span><span>Loadsheet</span><span>Aula virtual</span></div>

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

          <SectionHead icon="bi-geo-alt">Ver el loadsheet que te envía el alumno</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Buscá el botón <Chip variant="outline">Ver Loadsheet del alumno</Chip></>}>
              <p className="man__step-text">Aparece en la tarjeta del vuelo apenas el alumno hace clic en "Guardar y enviar" desde el suyo. Lo abrís en <strong>modo lectura</strong>: podés ver, imprimir y descargar el PDF, pero no editarlo.</p>
            </Step>
          </div>

          <SectionHead icon="bi-mortarboard">Otras tareas frecuentes</SectionHead>
          <div className="man__steps">
            <Step n={1} title="Editar el límite semanal de tus alumnos">
              <p className="man__step-text">Desde tu Dashboard, en la fila de cada alumno podés ajustar su límite de vuelos de avión y de simulador (0 a 6) sin depender de que sea "la semana próxima".</p>
            </Step>
            <Step n={2} title="Aula Virtual">
              <p className="man__step-text">Tres pestañas: <span className="man__tabs" style={{ display: "inline-flex", verticalAlign: "middle" }}><span className="on">Material</span><span>Evaluaciones</span><span>Asistencia</span></span>. Subís material por unidad, calificás exámenes alumno por alumno (botón <Chip variant="outline">Calificar</Chip>) y pasás lista de asistencia por sesión.</p>
            </Step>
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>

        {/* ───────── TURNO ───────── */}
        <section className={`man__page ${active === "turno" ? "active" : ""}`}>
          <div className="man__kicker"><i className="bi bi-megaphone" />Manual 03</div>
          <h1 className="man__title">Turno</h1>
          <p className="man__lede">Sos el respaldo operativo del día: seguís el estado de todos los vuelos, mantenés informados a todos por el ticker, y cerrás el día con el reporte de vuelos por avión.</p>
          <div className="man__strip"><span>Vuelos del día</span><span>Operaciones</span><span>Ticker</span><span>Reporte del día</span></div>

          <SectionHead icon="bi-arrow-repeat" hint={<>Mismo ciclo de vida que usa el instructor — ver <a href="#ciclo" onClick={(e) => { e.preventDefault(); go("ciclo"); }}>la página de referencia</a>.</>}>Vuelos del día</SectionHead>
          <div className="man__steps">
            <Step n={1} title='Revisá el contador de "vuelos activos" en tu Dashboard operativo'>
              <p className="man__step-text">Te da una foto rápida de cuántos vuelos siguen abiertos en este momento.</p>
            </Step>
            <Step n={2} title="Avanzá un vuelo solo si el instructor no lo hizo">
              <p className="man__step-text">Cada tarjeta tiene el mismo botón de avance (<Chip>→ Salida hangar</Chip>, etc.). Es un respaldo — el instructor es quien normalmente marca su propio vuelo.</p>
            </Step>
            <Step n={3} title="Editá la tripulación si hace falta">
              <p className="man__step-text">El ícono de lápiz en la tarjeta abre el editor de <strong>alumno, instructor, aeronave y almas a bordo</strong>.</p>
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
              <p className="man__step-text">Genera un PDF con los vuelos completados de ese día, agrupados por avión: tacómetro y hobbs inicial/final, monto cobrado e instructor. Es el reporte que se usa para cuadrar caja.</p>
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
          <p className="man__lede">Mantenés la aeronavegabilidad de la flota bajo control: componentes, tareas programadas e inventario de repuestos.</p>
          <div className="man__strip"><span>Aeronavegabilidad</span><span>Cumplir tarea</span><span>Inventario</span></div>

          <SectionHead icon="bi-tools">Aeronavegabilidad</SectionHead>
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
              <p className="man__step-text">Las tareas pueden vencer por horas de vuelo, ciclos o fecha calendario (inspecciones, AD, SB, vida límite).</p>
            </Step>
            <Step n={3} title={<>Cuando se realice el trabajo, tocá <Chip variant="secondary">Cumplir</Chip></>}>
              <p className="man__step-text">Reinicia el reloj de esa tarea desde cero — el próximo vencimiento se recalcula automáticamente.</p>
            </Step>
          </div>

          <SectionHead icon="bi-cash-coin">Inventario de repuestos</SectionHead>
          <div className="man__steps">
            <Step n={1} title={<>Registrá un repuesto nuevo con <Chip variant="secondary">+ Nuevo repuesto</Chip></>} />
            <Step n={2} title={<>Movimientos de stock: <Chip variant="secondary">Movimiento</Chip></>}>
              <p className="man__step-text">Tres tipos: <strong>Entrada (+)</strong>, <strong>Salida (−)</strong> y <strong>Ajuste</strong> (fija el stock a un número exacto). Una salida de repuesto genera automáticamente un egreso contable.</p>
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
          </div>

          <hr className="man__sep" />
          <LoginCTA />
        </section>
      </main>
    </div>
  );
}
