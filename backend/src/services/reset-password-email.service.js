const { sendEmail, emailLayout, appBaseDomain } = require('./email.service');

async function sendResetPasswordEmail({ to, tempPassword, tenantName, slug }) {
  const domain = appBaseDomain();
  const loginUrl = slug ? `https://${slug}.${domain}` : `https://${domain}`;

  const html = emailLayout({
    title: 'Redefinição de senha — GestãoZap',
    bodyHtml: `
      <p>Olá! Uma nova senha temporária foi gerada para a conta <strong>${tenantName}</strong>:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
        <span style="font-family:monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#0f172a">${tempPassword}</span>
      </div>
      <p><a href="${loginUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Acessar plataforma</a></p>
      <p style="color:#64748b;font-size:14px">Ao entrar, você será solicitado a criar uma nova senha. Se não solicitou esta redefinição, entre em contato com o suporte.</p>
    `,
    footerNote: 'Mensagem automática — não responda este e-mail.',
  });

  return sendEmail({
    to,
    subject: `Sua nova senha temporária — GestãoZap`,
    html,
  });
}

module.exports = { sendResetPasswordEmail };
