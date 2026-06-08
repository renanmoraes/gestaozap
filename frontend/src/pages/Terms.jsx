import React, { useState } from 'react';
import {
  FileText, CheckCircle2, XCircle, AlertTriangle, Shield, Zap,
  Clock, Phone, Ban,
} from 'lucide-react';

export default function Terms({ onAccept, onDecline }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="card p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Antes de começar</h1>
              <p className="text-sm text-slate-500">É importante ler. Vai por nós.</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 p-5 max-h-[28rem] overflow-y-auto text-sm text-slate-700 space-y-5 mb-6 leading-relaxed">

            <p className="text-slate-600 italic">
              A ideia aqui é deixar tudo claro, sem letras miúdas escondidas. São pontos que a gente
              acredita que você precisa saber antes de mandar a primeira mensagem.
            </p>

            <h2 className="font-semibold text-slate-900">1. O que dá pra fazer aqui (e o que não dá)</h2>
            <p>
              O GestãoZap é uma ferramenta de automação que conversa com o WhatsApp Web em nome do
              seu número. Use para falar com pessoas que <strong>já te conhecem</strong> ou que
              autorizaram receber mensagens — clientes da sua loja, alunos do seu curso, convidados
              do seu evento. Não é para sair atirando para todo lado: spam para listas compradas,
              correntes e propagandas para quem nunca ouviu falar de você são caminho certo para
              encrenca (sua e nossa).
            </p>

            <h2 className="font-semibold text-slate-900">2. As regras do WhatsApp valem aqui</h2>
            <p>
              O WhatsApp tem as próprias{' '}
              <a href="https://www.whatsapp.com/legal/terms-of-service" target="_blank" rel="noopener noreferrer"
                className="text-brand-600 underline">regras de uso</a>{' '}
              e as{' '}
              <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer"
                className="text-brand-600 underline">políticas para negócios</a>
              {' '}— e elas não desaparecem quando você usa a gente. As regras proíbem:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>Envios em massa para quem não autorizou</li>
              <li>Mensagens automáticas ou disparos sem consentimento</li>
              <li>Uso de ferramentas não oficiais para acessar o WhatsApp em escala</li>
              <li>Conteúdo enganoso, golpe, scam, spam</li>
              <li>Ignorar pedidos de “pare de me mandar” / opt-out</li>
              <li>Categorias proibidas (drogas, armas, conteúdo adulto, etc.)</li>
            </ul>
            <p>
              Se você fizer algo que o WhatsApp considera abuso, eles podem banir o seu número.
              E isso é decisão deles, não nossa.
            </p>

            {/* O QUE A GENTE FAZ — bloco novo de transparência */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <h3 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                3. O que a gente faz para reduzir o risco
              </h3>
              <p className="text-emerald-800 mb-3">
                A plataforma não é só um botão de "enviar mensagem". A gente trabalha em várias
                camadas para que o seu número fique o mais saudável possível dentro do WhatsApp.
                O que está montado por baixo dos panos:
              </p>
              <ul className="text-emerald-800 space-y-2">
                <li className="flex gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Intervalos aleatórios</strong> entre cada envio (15s a 60s por padrão)
                    para simular o ritmo humano, em vez de mandar tudo em rajada.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Pausas longas entre lotes</strong> (10 minutos a cada 30 mensagens) para
                    o seu número não parecer um robô disparando sem parar.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Phone className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Validação estrita do número</strong> (formato internacional E.164)
                    antes de qualquer tentativa, para não gastar pulso com número inválido.
                  </span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Pré-checagem</strong> se o número está mesmo no WhatsApp antes do
                    envio — número que não existe vai direto para fila de descarte (sem retentar).
                  </span>
                </li>
                <li className="flex gap-2">
                  <Ban className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Anti-duplicidade por destinatário</strong>: o mesmo contato não recebe
                    a mesma mensagem duas vezes em 24h por engano, mesmo que você dispare em
                    paralelo.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Zap className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Classificação automática de erro</strong>: distinguimos falha
                    temporária (rede, timeout) de falha definitiva (número inválido, conteúdo
                    bloqueado) e só insistimos quando faz sentido — com espera exponencial.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Quality gate</strong>: se a taxa de erro dos seus envios passar de 2%
                    em curto prazo, a fila pausa sozinha — antes que o WhatsApp comece a olhar
                    torto pro seu número.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Ban className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Opt-out automático</strong>: quando alguém responde "SAIR", o contato
                    é marcado e nunca mais recebe disparo seu pela plataforma.
                  </span>
                </li>
                <li className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Kill switch operacional</strong>: se a gente identificar
                    comportamento de risco, o time pode pausar imediatamente os envios da sua
                    conta para te proteger.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Respeito à janela de horário</strong>: por padrão só enviamos entre
                    08h e 20h. Você pode mudar, mas mandar de madrugada aumenta reclamação.
                  </span>
                </li>
              </ul>
              <p className="text-emerald-800 mt-3">
                Cada item desses reduz <em>chance de problema</em>. Nenhum elimina o risco —
                e é exatamente por isso que vem o próximo bloco.
              </p>
            </div>

            {/* O QUE NÃO PODEMOS GARANTIR — central de não-responsabilidade */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                4. O que a gente <u>não</u> pode garantir
              </h3>
              <p className="text-amber-800">
                Mesmo com todas as proteções do item anterior, automação no WhatsApp Web sempre
                tem risco — e <strong>esse risco é seu</strong>. Esses pontos são especialmente
                importantes:
              </p>
              <ul className="text-amber-800 space-y-1.5 list-disc pl-5 mt-2">
                <li>
                  <strong>Não garantimos</strong> que o seu número não vai ser banido,
                  suspendido, limitado ou marcado como spam pelo WhatsApp.
                </li>
                <li>
                  <strong>Não temos como reverter</strong> banimento, suspensão ou restrição
                  de uso do WhatsApp — quem decide isso é a Meta, não a gente.
                </li>
                <li>
                  <strong>Não nos responsabilizamos</strong> por perda de contatos, perda de
                  histórico de conversa, lucros cessantes, oportunidades perdidas, danos
                  reputacionais ou qualquer prejuízo que surja em consequência de banimento,
                  suspensão, instabilidade do WhatsApp ou erro do próprio usuário.
                </li>
                <li>
                  <strong>Não somos afiliados</strong> ao WhatsApp/Meta. GestãoZap é uma ferramenta
                  independente que usa a versão Web do WhatsApp (não-oficial para automação) —
                  isso é parte do risco e você precisa saber.
                </li>
                <li>
                  <strong>Não devolvemos</strong> valores pagos no período em curso quando o
                  banimento for causado por uso abusivo da plataforma, lista comprada, conteúdo
                  proibido ou desrespeito a regras do WhatsApp.
                </li>
                <li>
                  Se a sua operação depende de zero risco de bloqueio ou de altíssima escala,
                  o caminho correto é a <strong>API oficial do WhatsApp Business</strong>, não
                  a gente. Avise se quiser orientação sobre essa migração.
                </li>
              </ul>
              <p className="text-amber-800 mt-3">
                Em outras palavras: a gente faz o nosso melhor e investe em proteções de verdade,
                mas a decisão de mandar cada mensagem é sua, a base de contatos é sua, e a
                responsabilidade pelo que acontecer com o seu número também é sua.
              </p>
            </div>

            <h2 className="font-semibold text-slate-900">5. Sobre os dados dos seus contatos</h2>
            <p>
              Tudo que você importa — nomes, telefones, etiquetas, conversas — fica guardado no
              nosso servidor só para você poder usar. A gente <strong>não vende, não compartilha
              com ninguém</strong> e não usa para nada além de fazer a plataforma funcionar para
              você. Pela LGPD, esses contatos são <strong>seus</strong>: você é quem precisa ter
              a autorização das pessoas para mandar mensagem, e quem responde se alguém reclamar
              à ANPD ou em juízo.
            </p>

            <h2 className="font-semibold text-slate-900">6. Sua parte do trato</h2>
            <p>
              Para usar a plataforma de forma sustentável, você se compromete a:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>Só mandar mensagem para gente que autorizou ou que tem relação com o seu negócio</li>
              <li>Respeitar pedidos de "pare de me mandar" imediatamente</li>
              <li>Não enviar conteúdo enganoso, golpe, conteúdo ilegal ou de categoria proibida</li>
              <li>Manter o WhatsApp do seu celular ativo (mínimo a cada 14 dias) para a sessão não cair</li>
              <li>Não compartilhar o acesso à sua conta GestãoZap com terceiros não autorizados</li>
              <li>Avisar a gente se notar algo estranho na sessão (login não reconhecido, etc.)</li>
            </ul>

            <h2 className="font-semibold text-slate-900">7. Mudanças nestes termos</h2>
            <p>
              Se a gente precisar ajustar algo importante aqui, te avisamos e você terá que aceitar
              de novo no próximo login. Nada de mudar regra sem te falar.
            </p>

            <h2 className="font-semibold text-slate-900">8. Se a coisa não der certo</h2>
            <p>
              Você pode parar de usar quando quiser. A gente também pode bloquear contas que usem
              a plataforma de jeito abusivo (spam pesado, conteúdo ilegal, golpe, comércio
              proibido) — nesses casos, o cancelamento é imediato e o valor pago do período em
              curso não é devolvido.
            </p>

            <p className="text-slate-500 text-xs pt-2 border-t border-slate-200">
              Dúvida sobre qualquer coisa aqui? É só chamar a gente — preferimos uma conversa
              direta a um problema depois. Última atualização: termos v2.0.
            </p>
          </div>

          {/* Checkbox de confirmação */}
          <label className="flex items-start gap-3 cursor-pointer mb-6 group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              Li tudo, entendi o que está em jogo e topo seguir em frente. Sei que o meu número
              de WhatsApp <strong>pode ser banido</strong>, que <strong>esse risco é meu</strong>
              {' '}e que o GestãoZap <strong>não responde por perdas decorrentes de banimento</strong>,
              suspensão ou restrição imposta pelo WhatsApp. Assumo a responsabilidade pela base
              de contatos, pelo conteúdo enviado e por respeitar as regras.
            </span>
          </label>

          <div className="flex gap-3">
            {onDecline && (
              <button
                onClick={onDecline}
                className="btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Agora não
              </button>
            )}
            <button
              onClick={onAccept}
              disabled={!agreed}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              Topo, vamos lá
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
