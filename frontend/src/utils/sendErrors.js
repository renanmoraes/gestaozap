const ERROR_LABELS = {
  rate_limit_24h: 'Este número já recebeu mensagem nas últimas 24 horas.',
  already_sent_campaign: 'Já recebeu esta campanha anteriormente.',
  not_on_whatsapp: 'Número não está cadastrado no WhatsApp.',
  transient_network: 'Falha temporária de rede ou conexão.',
  browser_unstable: 'Instabilidade temporária do navegador WhatsApp.',
  unknown: 'Erro não classificado pelo sistema.',
  media_not_found: 'Arquivo de imagem/mídia não encontrado.',
  recipient_not_on_whatsapp: 'Destinatário não está no WhatsApp.',
  jid_resolution_failed: 'Não foi possível resolver o contato no WhatsApp.',
  policy_violation: 'Mensagem bloqueada por política do WhatsApp.',
  max_retries: 'Número máximo de tentativas atingido.',
  invalid_phone: 'Número de telefone inválido.',
  phone_empty: 'Telefone vazio.',
  phone_unparseable: 'Telefone em formato inválido.',
  phone_invalid_format: 'Formato de telefone inválido.',
};

export function humanizeSendError(error) {
  if (error == null || String(error).trim() === '') {
    return '(Nenhuma mensagem de erro gravada neste registro.)';
  }
  const raw = String(error).trim();

  const attemptMatch = raw.match(/^attempt:(\d+):([^:]+)(?::([\s\S]+))?$/);
  if (attemptMatch) {
    const [, attempt, reason, detail] = attemptMatch;
    const label = ERROR_LABELS[reason] || reason;
    return `Tentativa ${attempt}: ${label}${detail ? `\n\nDetalhe técnico: ${detail}` : ''}`;
  }

  const prefixed = raw.match(/^(?:permanent|policy|dlq|max_retries):(.+)$/);
  if (prefixed) return humanizeSendError(prefixed[1]);

  if (raw.startsWith('phone_')) {
    const key = raw.replace('phone_', 'phone_');
    return ERROR_LABELS[key] || ERROR_LABELS.invalid_phone;
  }

  if (ERROR_LABELS[raw]) return ERROR_LABELS[raw];

  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0) {
    const reason = raw.slice(0, colonIdx);
    const detail = raw.slice(colonIdx + 1);
    if (ERROR_LABELS[reason]) {
      return `${ERROR_LABELS[reason]}${detail ? `\n\nDetalhe técnico: ${detail}` : ''}`;
    }
  }

  return raw;
}
