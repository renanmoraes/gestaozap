/**
 * ASAAS Integration — Webhook receiver
 *
 * Configurar no painel ASAAS: Minha Conta → Integrações → Webhooks
 * URL: https://gestaozap.digital/api/asaas/webhook
 * Eventos: PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, SUBSCRIPTION_INACTIVATED
 *
 * A API key do ASAAS fica em platform_config.key = 'asaas_api_key'
 * para poder ser rotacionada sem deploy.
 */

const router = require('express').Router();
const { eq, and, ne } = require('drizzle-orm');
const { getDb } = require('../db');
const { contracts, tenants, paymentRecords, whatsappSessions, affiliateReferrals } = require('../db/schema');

/**
 * POST /api/asaas/webhook
 * Processa eventos ASAAS. Não requer autenticação de tenant —
 * mas verifica o token de webhook configurado no ASAAS.
 */
router.post('/webhook', async (req, res) => {
  // Validação básica do token de webhook (configurar ASAAS_WEBHOOK_TOKEN em platform_config)
  const token = req.headers['asaas-access-token'];
  const { getConfig } = require('../config/platform');
  const expectedToken = getConfig('asaas_webhook_token');

  if (expectedToken && token !== expectedToken) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { event, payment } = req.body || {};

  if (!event || !payment) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const db = getDb();

  try {
    switch (event) {
      case 'PAYMENT_RECEIVED': {
        // Localiza o payment_record pelo asaas_payment_id
        const [record] = await db.select().from(paymentRecords)
          .where(eq(paymentRecords.asaasPaymentId, payment.id));

        if (!record) {
          console.warn('[asaas] payment_record não encontrado para', payment.id);
          break;
        }

        // Marca como pago
        await db.update(paymentRecords)
          .set({ status: 'paid', paidAt: new Date() })
          .where(eq(paymentRecords.id, record.id));

        // Se for assinatura, estende o contrato por 30 dias e reativa o tenant
        if (record.contractId) {
          const [contract] = await db.select().from(contracts)
            .where(eq(contracts.id, record.contractId));

          if (contract) {
            const newExpiry = new Date(Math.max(Date.now(), new Date(contract.expiresAt || Date.now()).getTime()));
            newExpiry.setDate(newExpiry.getDate() + 30);

            await db.update(contracts)
              .set({ status: 'active', expiresAt: newExpiry, updatedAt: new Date() })
              .where(eq(contracts.id, contract.id));

            // Reativa tenant se estava inativo por inadimplência
            await db.update(tenants)
              .set({ active: true, updatedAt: new Date() })
              .where(and(eq(tenants.id, contract.tenantId), eq(tenants.active, false)));

            // Comissão de afiliado é paga APENAS na primeira parcela.
            // Conta quantos pagamentos pagos existem desse contrato (excluindo o atual).
            const previousPaid = await db.select({ id: paymentRecords.id })
              .from(paymentRecords)
              .where(and(
                eq(paymentRecords.contractId, record.contractId),
                eq(paymentRecords.status, 'paid'),
                ne(paymentRecords.id, record.id),
              ));

            const isFirstInstallment = previousPaid.length === 0;

            if (isFirstInstallment) {
              // Primeira parcela paga → libera comissão do afiliado (se houver)
              const updated = await db.update(affiliateReferrals)
                .set({ status: 'confirmed', confirmedAt: new Date() })
                .where(and(
                  eq(affiliateReferrals.contractId, record.contractId),
                  eq(affiliateReferrals.status, 'pending'),
                ))
                .returning();
              if (updated.length) {
                console.log(`[asaas] comissão de afiliado liberada (1ª parcela) — referral ${updated[0].id}`);
              }
            } else {
              console.log(`[asaas] renovação detectada — sem nova comissão de afiliado`);
            }
          }
        }

        console.log(`[asaas] PAYMENT_RECEIVED ${payment.id} processado`);
        break;
      }

      case 'PAYMENT_OVERDUE': {
        // Pode enviar notificação via Socket.IO ou e-mail — por ora apenas loga
        console.warn(`[asaas] PAYMENT_OVERDUE ${payment.id}`);
        break;
      }

      case 'SUBSCRIPTION_INACTIVATED': {
        // Assinatura cancelada — desativa contrato correspondente
        const [contract] = await db.select().from(contracts)
          .where(eq(contracts.asaasSubscriptionId, payment.subscription));
        if (contract) {
          await db.update(contracts)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(contracts.id, contract.id));
          await db.update(tenants)
            .set({ active: false, updatedAt: new Date() })
            .where(eq(tenants.id, contract.tenantId));
          console.log(`[asaas] SUBSCRIPTION_INACTIVATED — tenant ${contract.tenantId} desativado`);
        }
        break;
      }

      default:
        // Evento não tratado — retorna 200 para o ASAAS não retentar
        break;
    }

    res.json({ received: true, event });
  } catch (err) {
    console.error('[asaas] webhook error:', err.message);
    res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
});

/**
 * Checklist de integração ASAAS (implementar quando tiver conta):
 *
 * 1. Adicionar em platform_config:
 *    - asaas_api_key: 'sua_api_key_de_producao'
 *    - asaas_webhook_token: 'token_gerado_no_painel'
 *    - asaas_environment: 'production' ou 'sandbox'
 *
 * 2. Ao criar tenant pelo admin, criar customer no ASAAS:
 *    POST https://api.asaas.com/v3/customers
 *    { name, cpfCnpj, email, mobilePhone }
 *    → salvar asaasCustomerId em tenants.asaas_customer_id
 *
 * 3. Ao contratar plano, criar subscription no ASAAS:
 *    POST https://api.asaas.com/v3/subscriptions
 *    { customer: asaas_customer_id, billingType: 'BOLETO', value: plano.price_brl,
 *      nextDueDate: próx_vencimento, cycle: 'MONTHLY' }
 *    → salvar asaasSubscriptionId em contracts.asaas_subscription_id
 *
 * 4. Registrar rota do webhook em app.js:
 *    app.use('/api/asaas', require('./routes/asaas.routes'))
 *    (sem tenantResolver — é chamado pelo ASAAS diretamente)
 */

module.exports = router;
