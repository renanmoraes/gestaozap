const { sendEmail, emailLayout, appBaseDomain } = require('./email.service');

async function sendWelcomeEmail({ to, companyId, email, tempPassword, tenantName, slug }) {
  const domain = appBaseDomain();
  const loginUrl = `https://${slug}.${domain}`;

  const html = emailLayout({
    title: `Seu acesso ao GestãoZap — ${tenantName}`,
    bodyHtml: `
      <p>Olá! Sua conta <strong>${tenantName}</strong> foi criada. Use os dados abaixo para o primeiro acesso:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:8px 0;color:#64748b">Identificador da empresa</td><td style="padding:8px 0;font-weight:600">${companyId}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Email</td><td style="padding:8px 0;font-weight:600">${email}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Senha temporária</td><td style="padding:8px 0;font-family:monospace">${tempPassword}</td></tr>
      </table>
      <p><a href="${loginUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Acessar plataforma</a></p>
      <ol style="line-height:1.7;color:#334155">
        <li>Acesse <a href="${loginUrl}">${loginUrl}</a></li>
        <li>Informe identificador, email e senha temporária</li>
        <li>Altere sua senha no primeiro acesso</li>
        <li>Conecte seu WhatsApp escaneando o QR Code</li>
      </ol>
    `,
    footerNote: 'Se não reconhece este cadastro, ignore este e-mail.',
  });

  return sendEmail({
    to,
    subject: `Seu acesso ao GestãoZap — ${tenantName}`,
    html,
  });
}

module.exports = { sendWelcomeEmail };
