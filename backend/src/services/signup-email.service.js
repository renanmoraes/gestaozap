const { sendEmail, emailLayout } = require('./email.service');

async function sendSignupReceived(to, name) {
  await sendEmail({
    to,
    subject: 'Recebemos seu cadastro — GestãoZap',
    html: emailLayout({
      bodyHtml: `<p>Olá, <strong>${name}</strong>!</p><p>Recebemos seu cadastro e ele está <strong>em análise</strong>. Avisaremos por e-mail assim que for aprovado e seu período de teste começar.</p>`,
    }),
  });
}

async function sendSignupApproved(to, name, slug, trialDays) {
  const { appBaseDomain } = require('./email.service');
  const url = `https://${slug}.${appBaseDomain()}`;
  const lifetime = !trialDays;
  const subject = lifetime ? 'Cadastro aprovado — acesso liberado!' : 'Cadastro aprovado — seu trial começou!';
  const body = lifetime
    ? `<p>Olá, <strong>${name}</strong>!</p><p>Seu cadastro foi aprovado com <strong>acesso vitalício</strong>.</p><p>Acesse: <a href="${url}">${url}</a> com seu e-mail e senha cadastrados.</p>`
    : `<p>Olá, <strong>${name}</strong>!</p><p>Seu cadastro foi aprovado e você tem <strong>${trialDays} dias de teste grátis</strong>.</p><p>Acesse: <a href="${url}">${url}</a> com seu e-mail e senha cadastrados.</p>`;
  await sendEmail({ to, subject, html: emailLayout({ bodyHtml: body }) });
}

async function sendSignupRejected(to, name) {
  await sendEmail({
    to,
    subject: 'Sobre seu cadastro — GestãoZap',
    html: emailLayout({
      bodyHtml: `<p>Olá, ${name}.</p><p>Infelizmente seu cadastro não foi aprovado no momento. Em caso de dúvidas, entre em contato.</p>`,
    }),
  });
}

module.exports = { sendSignupReceived, sendSignupApproved, sendSignupRejected };
