export function estimateCampaignDuration(totalContacts, config, workers = 1) {
  if (!totalContacts || !config) return { contactsPerDay: 0, days: 0 };
  const avgDelayMs = (config.antibanDelayMinMs + config.antibanDelayMaxMs) / 2;
  const batchOverheadMs = config.batchPauseMs / config.batchSize;
  const msPerContact = (avgDelayMs + batchOverheadMs) / Math.max(1, workers);
  const msPerDay = (config.hourEnd - config.hourStart) * 3600 * 1000;
  const contactsPerDay = Math.max(1, Math.floor(msPerDay / msPerContact));
  const days = totalContacts / contactsPerDay;
  return { contactsPerDay, days };
}

export function formatEstimate(totalContacts, config, workers = 1) {
  const { contactsPerDay, days } = estimateCampaignDuration(totalContacts, config, workers);
  if (!contactsPerDay) return null;
  const daysLabel = days < 1
    ? `~${Math.ceil(days * 24)}h`
    : days < 2 ? '~1 dia' : `~${Math.ceil(days)} dias`;
  return `~${contactsPerDay.toLocaleString('pt-BR')}/dia · ${daysLabel}`;
}
