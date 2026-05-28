const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT),
  secure: true,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: (process.env.MAIL_PASSWORD || "").replace(/"/g, ""),
  },
});

const originalSendMail = transporter.sendMail.bind(transporter);

transporter.sendMail = (options) => {
  if (process.env.DISABLE_MAILS === 'true' || true) { // Hardcoded true as requested "ahorita"
    console.log(`[MAIL-SILENCED] To: ${options.to} | Subject: ${options.subject}`);
    return Promise.resolve({ messageId: 'silenced' });
  }
  return originalSendMail(options);
};

module.exports = transporter;
