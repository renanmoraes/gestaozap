import { getHourBr } from './timezone';
import { dialog } from './dialog';

export const DEFAULT_HOUR_START = 8;
export const DEFAULT_HOUR_END = 20;

/** Hora atual em Brasília (para janela de envio). */
export function getCurrentHourBr() {
  return getHourBr();
}

/** Janela [hourStart, hourEnd) — ex.: 8–20 = das 8h às 19h59 (horário de Brasília) */
export function isOutsideRecommendedHours(hour, hourStart = DEFAULT_HOUR_START, hourEnd = DEFAULT_HOUR_END) {
  return hour < hourStart || hour >= hourEnd;
}

export async function confirmSendOutsideHours(hourStart, hourEnd) {
  return dialog.confirm({
    title: 'Fora do horário sugerido',
    message:
      `Agora está fora do horário sugerido (${hourStart}h–${hourEnd}h). ` +
      'Disparar fora dessa janela pode aumentar o risco de bloqueio ou restrições na conta. ' +
      'Deseja continuar por sua conta e risco?',
    confirmLabel: 'Continuar mesmo assim',
    danger: true,
  });
}
