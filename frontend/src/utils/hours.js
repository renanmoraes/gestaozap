export const DEFAULT_HOUR_START = 8;
export const DEFAULT_HOUR_END = 20;

/** Janela [hourStart, hourEnd) — ex.: 8–20 = das 8h às 19h59 */
export function isOutsideRecommendedHours(hour, hourStart = DEFAULT_HOUR_START, hourEnd = DEFAULT_HOUR_END) {
  return hour < hourStart || hour >= hourEnd;
}

export function confirmSendOutsideHours(hourStart, hourEnd) {
  return window.confirm(
    `Agora está fora do horário sugerido (${hourStart}h–${hourEnd}h). ` +
      'Disparar fora dessa janela pode aumentar o risco de bloqueio ou restrições na conta. ' +
      'Deseja continuar por sua conta e risco?',
  );
}
