const { Resend } = require('resend');
const { affiliateLink } = require('../utils/app-base-url');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function domain() { return process.env.APP_BASE_DOMAIN || 'gestaozap.digital'; }
function from() { return process.env.RESEND_FROM || `noreply@${domain()}`; }

async function send(to, subject, html) {
  if (!resend) {
    console.warn('[affiliate-email] RESEND_API_KEY ausente — email não enviado');
    return;
  }
  try {
    await resend.emails.send({ from: from(), to, subject, html });
  } catch (err) {
    console.error('[affiliate-email] falha:', err.message);
    throw err;
  }
}

async function sendAffiliateWelcome({ to, name, code, commissionPct, discountPct }) {
  const link = affiliateLink(code);
  const commission = Number(commissionPct) || 0;
  const discount = Number(discountPct) || 0;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.6">
      <h2 style="color:#059669">Bem-vindo ao programa de afiliados GestãoZap</h2>
      <p>Olá, <strong>${name}</strong>!</p>
      <p>Sua conta de afiliado foi criada. Compartilhe seu link de indicação e ganhe comissão quando seus clientes assinarem.</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px;font-size:14px;color:#166534"><strong>Seu link de indicação</strong></p>
        <p style="margin:0;font-family:monospace;font-size:14px;word-break:break-all">
          <a href="${link}" style="color:#059669">${link}</a>
        </p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr>
          <td style="padding:8px 0;color:#64748b">Sua comissão</td>
          <td style="padding:8px 0;font-weight:600">${commission}% sobre o valor pago pelo cliente</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b">Desconto para seus clientes</td>
          <td style="padding:8px 0;font-weight:600">${discount}% no primeiro mês</td>
        </tr>
      </table>

      <h3 style="font-size:15px;margin:24px 0 8px">Regras do programa</h3>
      <ul style="padding-left:20px;color:#334155">
        <li>A comissão é paga <strong>apenas na 1ª parcela</strong> de cada cliente indicado.</li>
        <li>Renovações mensais <strong>não geram nova comissão</strong>.</li>
        <li>A comissão é confirmada após o <strong>pagamento confirmado</strong> do cliente (via Asaas).</li>
        <li>O desconto de ${discount}% vale para o cliente indicado no primeiro pagamento.</li>
      </ul>

      <p style="margin-top:24px">
        <a href="${link}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
          Ver meu link de indicação
        </a>
      </p>

      <p style="font-size:13px;color:#64748b;margin-top:32px">
        Dúvidas? Responda este email ou fale conosco pelo WhatsApp.
      </p>
    </div>
  `;

  await send(to, 'Seu link de afiliado GestãoZap — regras e comissões', html);
}

module.exports = { sendAffiliateWelcome };
