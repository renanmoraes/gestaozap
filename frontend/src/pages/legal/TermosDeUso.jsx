import React from 'react';
import LegalLayout, { H2, P, UL, Callout } from './LegalLayout';

const TOC = [
  { id: 'aceitacao', label: 'Aceitação dos termos' },
  { id: 'servico', label: 'O que é o GestãoZap' },
  { id: 'cadastro', label: 'Cadastro, aprovação e acesso' },
  { id: 'planos', label: 'Trial, planos e pagamento' },
  { id: 'uso', label: 'Uso aceitável' },
  { id: 'whatsapp', label: 'Regras do WhatsApp' },
  { id: 'protecoes', label: 'O que fazemos para reduzir risco' },
  { id: 'limitacao', label: 'O que não garantimos' },
  { id: 'dados', label: 'Dados dos seus contatos' },
  { id: 'afiliados', label: 'Programa de afiliados' },
  { id: 'cancelamento', label: 'Vigência e cancelamento' },
  { id: 'alteracoes', label: 'Alterações' },
  { id: 'foro', label: 'Lei aplicável e foro' },
];

export default function TermosDeUso() {
  return (
    <LegalLayout
      title="Termos de Uso"
      updated="08 de junho de 2026 (v2.0)"
      intro="Estes Termos regem o uso da plataforma GestãoZap. A ideia aqui é deixar tudo claro, sem letras miúdas escondidas — o que você pode esperar da gente e o que esperamos de você."
      toc={TOC}
    >
      <H2 id="aceitacao">1. Aceitação dos termos</H2>
      <P>
        Ao se cadastrar e utilizar o GestãoZap (“plataforma”, “serviço”), você (“usuário”, “cliente”)
        declara que leu, entendeu e concorda com estes Termos de Uso e com a nossa Política de
        Privacidade. Caso não concorde, não utilize a plataforma.
      </P>
      <P>
        O serviço é operado por <strong>GestãoZap</strong> (gestaozap.digital). A identificação completa
        da empresa responsável (razão social e CNPJ) pode ser solicitada pelos canais de contato.
      </P>

      <H2 id="servico">2. O que é o GestãoZap</H2>
      <P>
        O GestãoZap é uma ferramenta de automação e gestão de comunicação que opera em conjunto com o
        WhatsApp Web em nome do número do próprio usuário, oferecendo disparo de mensagens em escala,
        organização de contatos (CRM) e chat ao vivo. O GestãoZap é uma ferramenta independente e
        <strong> não é afiliada, patrocinada ou endossada pelo WhatsApp ou pela Meta</strong>.
      </P>

      <H2 id="cadastro">3. Cadastro, aprovação e acesso</H2>
      <P>
        Para usar o serviço, é necessário fazer um pré-cadastro informando dados verdadeiros (nome,
        documento CPF ou CNPJ, e-mail, telefone). Todo cadastro passa por <strong>aprovação</strong>
        antes da liberação do acesso. Reservamo-nos o direito de aprovar ou recusar cadastros a nosso
        critério, especialmente diante de indícios de uso abusivo.
      </P>
      <UL>
        <li>Você é responsável por manter a confidencialidade da sua senha e por toda atividade na sua conta.</li>
        <li>Os dados informados devem ser corretos e atualizados.</li>
        <li>Não compartilhe seu acesso com terceiros não autorizados.</li>
      </UL>

      <H2 id="planos">4. Trial, planos e pagamento</H2>
      <P>
        Após a aprovação, sua conta pode iniciar com um <strong>período de teste grátis (trial)</strong>
        por prazo determinado, informado no momento da aprovação. Ao fim do trial, o uso das funções de
        envio fica condicionado à contratação de um plano pago. Os valores, limites e formas de
        pagamento são os vigentes no momento da contratação.
      </P>
      <UL>
        <li>O não pagamento após o trial ou após o vencimento bloqueia o envio de mensagens.</li>
        <li>Eventuais descontos por código de afiliado aplicam-se conforme as condições divulgadas.</li>
        <li>Tributos aplicáveis podem incidir sobre os valores conforme a legislação.</li>
      </UL>

      <H2 id="uso">5. Uso aceitável</H2>
      <P>
        Use o GestãoZap para falar com pessoas que <strong>já te conhecem ou autorizaram</strong> receber
        suas mensagens — clientes, alunos, convidados. Ao usar a plataforma, você se compromete a:
      </P>
      <UL>
        <li>Só enviar mensagens a quem autorizou ou tem relação legítima com o seu negócio;</li>
        <li>Respeitar imediatamente pedidos de descadastro (“pare de me mandar” / opt-out);</li>
        <li>Não enviar spam, correntes, conteúdo enganoso, golpes ou conteúdo ilegal;</li>
        <li>Não tratar categorias proibidas (drogas, armas, conteúdo adulto, etc.);</li>
        <li>Manter o WhatsApp do seu aparelho ativo para a sessão não cair.</li>
      </UL>

      <H2 id="whatsapp">6. As regras do WhatsApp valem aqui</H2>
      <P>
        O WhatsApp possui seus próprios{' '}
        <a className="text-brand-600 underline" href="https://www.whatsapp.com/legal/terms-of-service" target="_blank" rel="noopener noreferrer">Termos de Serviço</a>{' '}
        e{' '}
        <a className="text-brand-600 underline" href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">Políticas para Negócios</a>,
        que continuam valendo ao usar a nossa plataforma. O descumprimento pode levar o WhatsApp a
        limitar, suspender ou banir o seu número — decisão que é exclusiva da Meta.
      </P>

      <H2 id="protecoes">7. O que fazemos para reduzir o risco</H2>
      <Callout tone="emerald">
        A plataforma trabalha em várias camadas para manter o seu número o mais saudável possível:
        intervalos aleatórios entre envios, pausas entre lotes, validação e pré-checagem de números,
        anti-duplicidade por destinatário, classificação de erros com reenvio inteligente, “quality
        gate” que pausa a fila se a taxa de erro subir, opt-out automático e respeito à janela de
        horário. Cada item reduz a <em>chance</em> de problema — nenhum elimina o risco.
      </Callout>

      <H2 id="limitacao">8. O que não garantimos (limitação de responsabilidade)</H2>
      <Callout tone="amber">
        <P>
          Automação no WhatsApp Web sempre tem risco, e <strong>esse risco é do usuário</strong>.
          Especificamente:
        </P>
        <UL>
          <li><strong>Não garantimos</strong> que o seu número não será banido, suspenso ou limitado pelo WhatsApp.</li>
          <li><strong>Não temos como reverter</strong> banimentos ou restrições impostos pela Meta.</li>
          <li><strong>Não nos responsabilizamos</strong> por perda de contatos, histórico, lucros cessantes, oportunidades, danos reputacionais ou prejuízos decorrentes de banimento, instabilidade do WhatsApp ou erro do usuário.</li>
          <li><strong>Não devolvemos</strong> valores do período em curso quando o bloqueio decorrer de uso abusivo, lista comprada, conteúdo proibido ou desrespeito às regras.</li>
        </UL>
      </Callout>

      <H2 id="dados">9. Sobre os dados dos seus contatos</H2>
      <P>
        Os dados que você importa (nomes, telefones, etiquetas, conversas) ficam armazenados apenas para
        viabilizar o seu uso. <strong>Não vendemos nem compartilhamos</strong> esses dados. Em relação a
        eles, você atua como <strong>controlador</strong> e o GestãoZap como <strong>operador</strong> —
        veja a Política de Privacidade e a página de LGPD para detalhes.
      </P>

      <H2 id="afiliados">10. Programa de afiliados</H2>
      <P>
        Cadastros realizados por meio de um link de afiliado podem conceder descontos ao cliente e gerar
        comissão ao afiliado. A comissão é apurada conforme as regras vigentes (em geral, confirmada
        após o primeiro pagamento). O uso fraudulento do programa pode levar ao cancelamento de
        comissões e da conta.
      </P>

      <H2 id="cancelamento">11. Vigência e cancelamento</H2>
      <P>
        Você pode parar de usar a qualquer momento. Podemos suspender ou encerrar contas que violem
        estes Termos (spam pesado, conteúdo ilegal, golpe, comércio proibido), caso em que o
        cancelamento é imediato e sem devolução do valor do período em curso.
      </P>

      <H2 id="alteracoes">12. Alterações destes termos</H2>
      <P>
        Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas e poderão exigir novo
        aceite no próximo acesso. O uso continuado após a vigência implica concordância.
      </P>

      <H2 id="foro">13. Lei aplicável e foro</H2>
      <P>
        Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do
        domicílio do consumidor para dirimir controvérsias, quando aplicável a legislação consumerista,
        ou o foro da sede da empresa nos demais casos.
      </P>
    </LegalLayout>
  );
}
