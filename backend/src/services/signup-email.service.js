const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function domain() { return process.env.APP_BASE_DOMAIN || 'gestaozap.digital'; }
function from() { return process.env.RESEND_FROM || `noreply@${domain()}`; }

async function send(to, subject, html) {
  if (!resend) { console.warn('[signup-email] RESEND_API_KEY ausente — email não enviado'); return; }
  try {
    await resend.emails.send({ from: from(), to, subject, html });
  } catch (err) {
    console.error('[signup-email] falha:', err.message);
  }
}

async function sendSignupReceived(to, name) {
  await send(to, 'Recebemos seu cadastro — GestãoZap',
    `<p>Olá, ${name}!</p><p>Recebemos seu cadastro e ele está <strong>em análise</strong>. Avisaremos por email assim que for aprovado e seu período de teste começar.</p>`);
}

async function sendSignupApproved(to, name, slug, trialDays) {
  const url = `https://${slug}.${domain()}`;
  await send(to, 'Cadastro aprovado — seu trial começou!',
    `<p>Olá, ${name}!</p><p>Seu cadastro foi aprovado e você tem <strong>${trialDays} dias de teste grátis</strong>.</p><p>Acesse: <a href="${url}">${url}</a> com seu email e senha cadastrados.</p>`);
}

async function sendSignupRejected(to, name) {
  await send(to, 'Sobre seu cadastro — GestãoZap',
    `<p>Olá, ${name}.</p><p>Infelizmente seu cadastro não foi aprovado no momento. Em caso de dúvidas, entre em contato.</p>`);
}

module.exports = { sendSignupReceived, sendSignupApproved, sendSignupRejected };
