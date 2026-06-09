/**
 * Copy humanizada para erros e confirmações da plataforma.
 */

const HTTP_FALLBACKS = {
  400: 'Algum dado não bateu. Confira os campos e tente de novo.',
  401: 'Sua sessão expirou. Entre de novo para continuar.',
  403: 'Você não tem permissão para fazer isso.',
  404: 'Não encontramos o que você pediu.',
  409: 'Isso entra em conflito com algo que já existe.',
  429: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  500: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
};

export function apiErrorMessage(err, fallback = 'Não rolou agora. Tente de novo.') {
  const data = err?.response?.data;
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  const status = err?.response?.status;
  if (status && HTTP_FALLBACKS[status]) return HTTP_FALLBACKS[status];
  if (err?.message && !err.message.includes('Network Error')) return err.message;
  return fallback;
}

export const MSG = {
  saveError: 'Não conseguimos salvar. Tente de novo em instantes.',
  removeContact: 'Remover este contato? Essa ação não dá para desfazer.',
  removeTemplate: 'Remover este template? Essa ação não dá para desfazer.',
  removeQuickReply: (shortcut) => `Remover a mensagem rápida ${shortcut}?`,
  blockTenant: (name, verb) => `Confirma ${verb} ${name}?`,
  disconnectWa: 'Desconectar a sessão WhatsApp deste cliente? Ele vai precisar escanear o QR de novo.',
  payCommissions: 'Marcar todas as comissões confirmadas como pagas?',
  restoreBackup: (name) =>
    `Restaurar "${name}"?\n\nIsso substitui contatos, campanhas, logs e imagens atuais pelos dados deste backup. Não dá para desfazer.`,
  deleteBackup: (name) => `Excluir o backup "${name}"?`,
  migrateStorage:
    'Migrar todos os arquivos locais antigos para o R2?\n\nPode levar alguns minutos. O processo roda em segundo plano.',
  redriveDlq: 'Re-enfileirar todas as mensagens da DLQ? Elas vão tentar enviar de novo.',
  unlockKillSwitch: 'Liberar envios para este cliente?',
  sendFailed: 'Não rolou enviar agora. Confira a conexão e tente de novo.',
  syncFailed: 'Não foi possível iniciar a sincronização agora.',
  tagSaveFailed: 'Não foi possível salvar a tag.',
  templateSendFailed: 'Não rolou enviar o template.',
  historyLoadFailed: 'Não conseguimos carregar o histórico.',
  retryEnqueueFailed: 'Não conseguimos enfileirar o reenvio.',
  retryFailed: 'Não conseguimos reenviar.',
  feedbackFailed: 'Não conseguimos buscar o feedback.',
  extendContractFailed: 'Não conseguimos estender o contrato.',
  operationFailed: 'Não rolou a operação. Tente de novo.',
  adminSaveFailed: 'Não conseguimos salvar. Tente de novo.',
  migrationStarted: 'Migração iniciada em segundo plano. Acompanhe o progresso nos logs do servidor.',
  redriven: (n, campaigns) => `${n} mensagens re-enfileiradas em ${campaigns} campanha(s).`,
};
