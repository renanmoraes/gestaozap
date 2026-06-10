const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function appBaseDomain() {
  const raw = process.env.APP_BASE_DOMAIN || 'gestaozap.digital';
  return raw.replace(/^https?:\/\//, '').split(':')[0];
}

function defaultFrom() {
  return process.env.RESEND_FROM || `noreply@${appBaseDomain()}`;
}

/**
 * Envio centralizado de e-mails transacionais (Resend).
 * @returns {{ sent: boolean, messageId?: string, reason?: string }}
 */
async function sendEmail({ to, subject, html, from }) {
  if (!to) return { sent: false, reason: 'NO_RECIPIENT' };
  if (!resend) {
    console.warn('[email] RESEND_API_KEY ausente — email não enviado:', subject);
    return { sent: false, reason: 'RESEND_NOT_CONFIGURED' };
  }
  try {
    const response = await resend.emails.send({
      from: from || defaultFrom(),
      to,
      subject,
      html,
    });
    if (response.error) {
      console.error('[email] falha Resend:', response.error.message);
      return { sent: false, reason: response.error.message };
    }
    return { sent: true, messageId: response.data?.id };
  } catch (err) {
    console.error('[email] falha:', err.message);
    return { sent: false, reason: err.message };
  }
}

function emailLayout({ title, bodyHtml, footerNote }) {
  return `
    <div style="font-family:DM Sans,Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.6">
      <div style="padding:24px 0 16px;border-bottom:1px solid #e2e8f0;margin-bottom:20px">
        <strong style="color:#059669;font-size:18px">GestãoZap</strong>
      </div>
      ${title ? `<h1 style="font-size:20px;margin:0 0 12px;color:#0f172a">${title}</h1>` : ''}
      ${bodyHtml}
      <p style="font-size:12px;color:#94a3b8;margin-top:28px">${footerNote || 'Mensagem automática — não responda este e-mail.'}</p>
    </div>
  `;
}

module.exports = {
  sendEmail,
  emailLayout,
  appBaseDomain,
  defaultFrom,
};
