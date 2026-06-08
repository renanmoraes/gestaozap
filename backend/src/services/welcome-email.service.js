const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function appBaseDomain() {
  const raw = process.env.APP_BASE_DOMAIN || 'gestaozap.digital';
  return raw.replace(/^https?:\/\//, '').split(':')[0];
}

async function sendWelcomeEmail({ to, companyId, email, tempPassword, tenantName, slug }) {
  const domain = appBaseDomain();
  const loginUrl = `https://${slug}.${domain}`;
  const from = process.env.RESEND_FROM || `noreply@${domain}`;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="color:#059669">Bem-vindo ao GestãoZap!</h2>
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
      <p style="font-size:13px;color:#94a3b8">Se não reconhece este cadastro, ignore este email.</p>
    </div>
  `;

  if (!resend) {
    console.warn('[welcome-email] RESEND_API_KEY ausente — email não enviado');
    return { sent: false, reason: 'RESEND_NOT_CONFIGURED' };
  }

  const response = await resend.emails.send({
    from,
    to,
    subject: `Seu acesso ao GestãoZap — ${tenantName}`,
    html,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return { sent: true, messageId: response.data?.id };
}

module.exports = { sendWelcomeEmail };
