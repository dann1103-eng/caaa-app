# Product

## Register

product

## Users

Cuatro perfiles activos, todos profesionales o estudiantes adultos:

1. **Personal contable/administrativo (rol `ADMINISTRACION`)** — escritorio en oficina, sesiones largas (4-8h), ingreso intensivo de datos: facturas, cobros, ajustes, nómina. Necesita densidad y velocidad de tablas, atajos de teclado eventuales, lectura rápida de números.
2. **Alumno-piloto (rol `ALUMNO`)** — usa móvil o laptop ocasional antes y después de vuelos, frecuentemente bajo luz fuerte de aeropuerto. Sesiones cortas y orientadas a verificar saldo, agendar, revisar progreso del curso y notas. Es un adulto motivado pero no técnico.
3. **Instructor / personal de hangar (rol `INSTRUCTOR`)** — iPad o laptop en hangar, condiciones de luz no ideales, calificar evaluaciones del aula virtual, firmar reportes de vuelo. Necesita controles táctiles generosos y formularios cortos.
4. **Dirección CAAA (rol `ADMIN`)** — vista ejecutiva, accede a KPIs del dashboard financiero y reportes, sesiones cortas pero de alto valor para decisiones operativas.

## Product Purpose

Sistema de gestión integral para Centro de Adiestramiento Aéreo Académico (CAAA, El Salvador). Cubre operación (agendamiento de vuelos, ciclo de estado, mantenimiento, METAR, reportes con firma digital), administración financiera (cuenta corriente prepagada por alumno, facturación, nómina dual, egresos, KPIs) y aula virtual (unidades teóricas por licencia, evaluaciones, progreso académico). Exito = la escuela opera con menos papel azul, menos planillas Excel, y los datos de cada vuelo, depósito, factura, nota y certificado están en un solo sistema confiable.

## Brand Personality

**Aeronáutico, Preciso, Institucional.** Tono profesional sin acartonamiento, español neutro de El Salvador. La autoridad viene de la exactitud de los datos y la disciplina visual, no de adornos. CAAA tiene 60+ años formando pilotos profesionales: la app debe sentirse heredera de esa tradición sin ser nostálgica.

Voz: directa, instruccional, breve. Ejemplos: "Saldo insuficiente: te faltan $42.50 para agendar este vuelo." No: "¡Oops! Parece que no tienes suficiente saldo."

## Anti-references

- **Plantilla admin Bootstrap genérica:** cards idénticos en grilla con icono+heading+texto, hero-metric con número gigante + label, colores chillones, iconos circulares por todos lados. La trampa "AI hizo esta página".
- **Lujo decorativo o fintech-glow:** gradientes textuales, glassmorphism, neón morado/azul sobre negro, sombras exageradas, florituras de motion. La app no es una crypto wallet.
- **Modo oscuro por default:** se usa en horario laboral y por alumnos al exterior. Light mode primero; dark mode como opción coherente, no como pose.
- **Sistemas de gobierno El Salvador años 2000:** tablas grises planas, formularios sin jerarquía, botones azules brillantes, abuso de mayúsculas.

## Design Principles

1. **Precisión sobre decoración.** Los números se alinean tabularmente, se monospacean los correlativos (facturas, recibos, matrículas YS-334PE, H.V. del vuelo). Las tablas son herramientas, no objetos decorativos. Si una página pide un florido, primero quítalo.
2. **Cada superficie su densidad propia.** Admin contable acepta tablas densas y filas de 32px porque la persona vive ahí 8 horas. Aula virtual del alumno respira y tiene tipografía grande porque el alumno la mira en móvil bajo el sol. No estandarices ambas con el mismo padding.
3. **Aviación sin caricatura.** El carácter aeronáutico vive en detalles: monospaced para matrículas y correlativos, paleta con un verde-bandera y un azul-cielo profundo, tipografía con disciplina (Inter o Geist), un guiño sutil de "torre de control" en headers de listas, jamás siluetas de aviones decorativos. Si parece WizzAir, lo arruinaste.
4. **Histórico inmutable visible como UX, no como debug.** Anulaciones tachadas con causa visible. Ediciones marcadas con icono y tooltip de motivo. Auditoría no es algo escondido en un log: es información que el contador necesita para confiar en el saldo.
5. **El bloqueo dice qué falta hacer.** Errores y restricciones siempre incluyen el dato accionable. "Saldo $113, costo estimado $440, faltan $327" en lugar de "saldo insuficiente". El sistema no esconde su lógica, la explica.

## Accessibility & Inclusion

**WCAG AAA con móvil-first para el surface del alumno.** Contraste mínimo 7:1 para texto de cuerpo, 4.5:1 para texto grande. Tamaños táctiles ≥44px en surface alumno (Bootstrap default no cumple). `prefers-reduced-motion` respetado en todas las animaciones del aula virtual y dashboard. Focus ring visible siempre, 2px sólido con color de marca. Soporte para teclado total en formularios administrativos (Tab, Enter, Esc consistentes). Considerar instructores adultos mayores: tamaños de fuente legibles, motion limitada por default.
