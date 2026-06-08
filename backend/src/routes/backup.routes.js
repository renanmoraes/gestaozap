const router = require('express').Router();
const { DEFAULT_TENANT_ID } = require('../db');
const backup = require('../services/backup.service');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

/** Info de agendamento + lista de backups do tenant. */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    res.json({
      autoHour: backup.AUTO_HOUR,
      retention: backup.RETENTION,
      backups: backup.listBackups(tenantId),
    });
  } catch (err) {
    console.error('backup list:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Cria um backup agora (apenas dados do tenant). */
router.post('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await backup.createTenantBackup(tenantId, 'manual');
    res.status(201).json(result);
  } catch (err) {
    console.error('backup create:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Baixa o arquivo de backup (verificando que pertence ao tenant). */
router.get('/:name/download', (req, res) => {
  try {
    const filePath = backup.resolveBackupFile(req.params.name);
    res.download(filePath, req.params.name);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/** Restaura um backup (apenas dados do tenant — não afeta outros). */
router.post('/:name/restore', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await backup.restoreTenantBackup(tenantId, req.params.name);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('backup restore:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Remove um backup. */
router.delete('/:name', (req, res) => {
  try {
    res.json(backup.deleteBackup(req.params.name));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
