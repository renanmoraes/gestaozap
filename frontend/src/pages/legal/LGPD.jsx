import React from 'react';
import LegalLayout, { H2, H3, P, UL, Callout } from './LegalLayout';

const TOC = [
  { id: 'oque', label: 'O que é a LGPD' },
  { id: 'papeis', label: 'Controlador e operador' },
  { id: 'principios', label: 'Princípios que seguimos' },
  { id: 'bases', label: 'Bases legais do tratamento' },
  { id: 'direitos', label: 'Direitos do titular (art. 18)' },
  { id: 'exercer', label: 'Como exercer seus direitos' },
  { id: 'cliente', label: 'Responsabilidades do cliente' },
  { id: 'incidentes', label: 'Incidentes de segurança' },
  { id: 'internacional', label: 'Transferência internacional' },
  { id: 'dpo', label: 'Encarregado (DPO) e ANPD' },
];

export default function LGPD() {
  return (
    <LegalLayout
      title="LGPD — Proteção de Dados"
      updated="08 de junho de 2026"
      intro="Esta página resume nosso compromisso com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e explica os papéis, as bases legais e os direitos dos titulares de dados."
      toc={TOC}
    >
      <H2 id="oque">1. O que é a LGPD</H2>
      <P>
        A LGPD é a lei brasileira que regula o tratamento de dados pessoais, garantindo às pessoas
        (titulares) maior controle sobre os seus dados e impondo deveres a quem os trata. O GestãoZap
        adota práticas para estar em conformidade com a lei.
      </P>

      <H2 id="papeis">2. Controlador e operador</H2>
      <Callout tone="brand">
        <P>
          <strong>Dados de cadastro do cliente</strong> (nome, documento, e-mail, telefone): o GestãoZap
          é o <strong>controlador</strong>.
        </P>
        <P>
          <strong>Dados dos contatos importados pelo cliente</strong>: o <strong>cliente é o controlador</strong>
          {' '}e o GestãoZap é o <strong>operador</strong>, tratando esses dados apenas conforme as instruções
          do cliente e para operar a plataforma. A base legal e o consentimento para comunicação com
          esses contatos são responsabilidade do cliente.
        </P>
      </Callout>

      <H2 id="principios">3. Princípios que seguimos</H2>
      <UL>
        <li>Finalidade e adequação: tratamos dados para propósitos legítimos e informados;</li>
        <li>Necessidade: coletamos o mínimo necessário ao serviço;</li>
        <li>Transparência e segurança: informação clara e medidas técnicas de proteção;</li>
        <li>Não discriminação e prestação de contas (accountability).</li>
      </UL>

      <H2 id="bases">4. Bases legais do tratamento</H2>
      <UL>
        <li>Execução de contrato e procedimentos preliminares (art. 7º, V);</li>
        <li>Cumprimento de obrigação legal/regulatória (art. 7º, II);</li>
        <li>Legítimo interesse, com avaliação de impacto quando cabível (art. 7º, IX);</li>
        <li>Consentimento, quando for a base aplicável (art. 7º, I).</li>
      </UL>

      <H2 id="direitos">5. Direitos do titular (art. 18)</H2>
      <P>Você, como titular de dados, pode solicitar:</P>
      <UL>
        <li>Confirmação da existência de tratamento;</li>
        <li>Acesso aos dados;</li>
        <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
        <li>Portabilidade a outro fornecedor, observados os segredos comercial e industrial;</li>
        <li>Eliminação dos dados tratados com consentimento;</li>
        <li>Informação sobre compartilhamento com entes públicos e privados;</li>
        <li>Informação sobre a possibilidade de não consentir e suas consequências;</li>
        <li>Revogação do consentimento.</li>
      </UL>

      <H2 id="exercer">6. Como exercer seus direitos</H2>
      <P>
        Envie sua solicitação para <a className="text-brand-600" href="mailto:privacidade@gestaozap.digital">privacidade@gestaozap.digital</a>.
        Podemos solicitar informações para confirmar a sua identidade antes de atender. Responderemos
        no menor prazo possível, observados os limites legais.
      </P>
      <Callout tone="amber">
        Se o seu pedido se referir a dados que estão sob um cliente nosso (por exemplo, você recebeu
        uma mensagem de uma empresa que usa o GestãoZap), encaminharemos a solicitação ao respectivo
        controlador (a empresa cliente) e/ou orientaremos o contato correto, já que, nesse caso, atuamos
        apenas como operador.
      </Callout>

      <H2 id="cliente">7. Responsabilidades do cliente (controlador dos contatos)</H2>
      <UL>
        <li>Obter e manter base legal/consentimento para comunicar-se com seus contatos;</li>
        <li>Atender aos direitos dos titulares da sua base e aos pedidos de opt-out;</li>
        <li>Não inserir dados sensíveis ou de terceiros sem amparo legal;</li>
        <li>Usar a plataforma de acordo com a LGPD e com as regras do WhatsApp.</li>
      </UL>

      <H2 id="incidentes">8. Incidentes de segurança</H2>
      <P>
        Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos titulares,
        adotaremos medidas de contenção e comunicaremos os afetados e a ANPD, quando exigido,
        conforme a legislação.
      </P>

      <H2 id="internacional">9. Transferência internacional</H2>
      <P>
        Caso algum provedor de infraestrutura processe dados fora do Brasil, adotaremos salvaguardas
        compatíveis com a LGPD para garantir o nível de proteção exigido.
      </P>

      <H2 id="dpo">10. Encarregado (DPO) e ANPD</H2>
      <P>
        Nosso encarregado pelo tratamento de dados pode ser contatado em{' '}
        <a className="text-brand-600" href="mailto:privacidade@gestaozap.digital">privacidade@gestaozap.digital</a>.
        Você também pode peticionar à Autoridade Nacional de Proteção de Dados (ANPD) caso entenda
        necessário.
      </P>
    </LegalLayout>
  );
}
