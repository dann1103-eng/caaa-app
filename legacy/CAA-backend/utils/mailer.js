const nodemailer = require("nodemailer");
// Railway no rutea IPv6 (igual que con Supabase). Sin esto nodemailer resuelve
// smtp.gmail.com a una IPv6 y falla con ENETUNREACH. Preferir IPv4 globalmente.
try { require("dns").setDefaultResultOrder("ipv4first"); } catch { /* node viejo */ }

// Acepta ambos juegos de nombres que conviven en el repo:
//   MAIL_USERNAME/MAIL_USER, MAIL_FROM_ADDRESS/MAIL_FROM.
const clean = (v) => (v || "").replace(/^"|"$/g, "").trim();

const HOST = clean(process.env.MAIL_HOST);
const PORT = parseInt(process.env.MAIL_PORT || "587", 10);
const USER = clean(process.env.MAIL_USERNAME || process.env.MAIL_USER);
const PASS = (process.env.MAIL_PASSWORD || "").replace(/"/g, "");
const FROM_ADDRESS = clean(process.env.MAIL_FROM_ADDRESS || process.env.MAIL_FROM) || USER;
const FROM_NAME = clean(process.env.MAIL_FROM_NAME) || "CAAA — Centro de Adiestramiento Aéreo Académico";

// Correo habilitado solo si MAIL_ENABLED=true Y hay host+usuario+clave.
const MAIL_ENABLED = String(process.env.MAIL_ENABLED).toLowerCase() === "true";
const CONFIGURED = Boolean(HOST && USER && PASS);
const ACTIVE = MAIL_ENABLED && CONFIGURED;

if (MAIL_ENABLED && !CONFIGURED) {
  console.warn("[mailer] MAIL_ENABLED=true pero faltan MAIL_HOST/MAIL_USER/MAIL_PASSWORD → correos silenciados.");
}

// Puerto 465 = TLS implícito (secure:true). 587/25 = STARTTLS (secure:false).
const realTransporter = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: PORT === 465,
  auth: { user: USER, pass: PASS },
  family: 4, // fuerza IPv4 en la conexión SMTP (Railway sin IPv6)
});

const DEFAULT_FROM = `"${FROM_NAME}" <${FROM_ADDRESS}>`;

const transporter = {
  /** Mismo contrato que nodemailer.sendMail; aplica `from` por defecto y respeta el gate. */
  sendMail(options = {}) {
    // Usa el `from` por defecto salvo que el call site pase uno explícito no vacío.
    const opts = { ...options, from: options.from || DEFAULT_FROM };
    if (!ACTIVE) {
      console.log(`[MAIL-SILENCED] To: ${opts.to} | Subject: ${opts.subject}`);
      return Promise.resolve({ messageId: "silenced", silenced: true });
    }
    return realTransporter.sendMail(opts);
  },
  get enabled() { return ACTIVE; },
};

module.exports = transporter;
