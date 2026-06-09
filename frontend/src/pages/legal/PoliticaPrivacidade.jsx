import React from 'react';
import LegalLayout, { H2, H3, P, UL, Callout } from './LegalLayout';

const TOC = [
  { id: 'quem', label: 'Quem somos' },
  { id: 'dados', label: 'Quais dados coletamos' },
  { id: 'uso', label: 'Como usamos os dados' },
  { id: 'bases', label: 'Bases legais' },
  { id: 'contatos', label: 'Dados dos seus contatos' },
  { id: 'compartilhamento', label: 'Compartilhamento' },
  { id: 'cookies', label: 'Cookies e tecnologias' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'retencao', label: 'Retenção e exclusão' },
  { id: 'direitos', label: 'Seus direitos' },
  { id: 'contato', label: 'Como falar conosco' },
];

export default function PoliticaPrivacidade() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      updated="08 de junho de 2026"
      intro="Esta Política explica como o GestãoZap coleta, usa, armazena e protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD)."
      toc={TOC}
    >
      <H2 id="quem">1. Quem somos</H2>
      <P>
        O GestãoZap (gestaozap.digital) é uma plataforma de gestão e automação de comunicação via
        WhatsApp. Para fins desta Política, somos o <strong>controlador</strong> dos dados de cadastro
        dos nossos clientes e <strong>operador</strong> em relação aos dados dos contatos que o cliente
        importa para a plataforma (veja a seção “Dados dos seus contatos” e a página de LGPD).
      </P>

      <H2 id="dados">2. Quais dados coletamos</H2>
      <H3>Dados de cadastro do cliente</H3>
      <UL>
        <li>Nome (pessoa física) ou razão social/nome fantasia (pessoa jurídica);</li>
        <li>CPF ou CNPJ;</li>
        <li>E-mail e número de WhatsApp;</li>
        <li>Senha (armazenada de forma criptografada — hash bcrypt);</li>
        <li>Eventual código de afiliado utilizado no cadastro.</li>
      </UL>
      <H3>Dados de uso e técnicos</H3>
      <UL>
        <li>Registros de acesso, data/hora, status de sessão do WhatsApp;</li>
        <li>Métricas de envio (entregues, falhas), logs operacionais e de segurança.</li>
      </UL>
      <H3>Dados que você insere</H3>
      <UL>
        <li>Contatos (nome, telefone, etiquetas), campanhas, mensagens e conversas geridas pela plataforma.</li>
      </UL>

      <H2 id="uso">3. Como usamos os dados</H2>
      <UL>
        <li>Criar e administrar sua conta, autenticar acessos e aplicar o fluxo de aprovação/trial;</li>
        <li>Fornecer e operar as funcionalidades (disparo, CRM, chat);</li>
        <li>Processar pagamentos e gerir contratos, planos e comissões de afiliado;</li>
        <li>Enviar comunicações transacionais (cadastro recebido, aprovação, cobrança, suporte);</li>
        <li>Garantir segurança, prevenir fraude e abuso, e cumprir obrigações legais.</li>
      </UL>

      <H2 id="bases">4. Bases legais (art. 7º da LGPD)</H2>
      <UL>
        <li><strong>Execução de contrato</strong>: para fornecer o serviço que você contratou;</li>
        <li><strong>Cumprimento de obrigação legal/regulatória</strong>: guarda de registros, fiscal;</li>
        <li><strong>Legítimo interesse</strong>: segurança, prevenção a fraude e melhoria do serviço;</li>
        <li><strong>Consentimento</strong>: quando aplicável, para comunicações específicas.</li>
      </UL>

      <H2 id="contatos">5. Dados dos seus contatos</H2>
      <Callout tone="brand">
        Os contatos que você importa são <strong>seus</strong>. Em relação a eles, você é o
        <strong> controlador</strong> e o GestãoZap atua apenas como <strong>operador</strong>,
        tratando os dados conforme as suas instruções e exclusivamente para operar a plataforma para
        você. Cabe a você possuir a base legal/consentimento adequado para se comunicar com essas
        pessoas. Não vendemos, alugamos nem usamos esses dados para finalidades próprias.
      </Callout>

      <H2 id="compartilhamento">6. Compartilhamento</H2>
      <P>
        Não vendemos dados pessoais. Compartilhamos apenas o necessário com operadores que viabilizam o
        serviço, sob obrigações de confidencialidade e segurança, por exemplo:
      </P>
      <UL>
        <li>Provedor de infraestrutura/hospedagem (servidores onde a plataforma roda);</li>
        <li>Provedor de envio de e-mail transacional;</li>
        <li>Processador de pagamentos;</li>
        <li>Autoridades, quando exigido por lei ou ordem judicial.</li>
      </UL>

      <H2 id="cookies">7. Cookies e tecnologias</H2>
      <P>
        Utilizamos armazenamento local (localStorage) e cookies estritamente necessários para manter
        sua sessão autenticada e o funcionamento da aplicação. Não usamos esses recursos para
        publicidade de terceiros.
      </P>

      <H2 id="seguranca">8. Segurança</H2>
      <P>
        Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo criptografia de
        senhas (hash bcrypt), tráfego protegido por HTTPS/TLS, isolamento por cliente (multi-tenant),
        controle de acesso e backups. Nenhum sistema é 100% imune; trabalhamos continuamente para
        reduzir riscos.
      </P>

      <H2 id="retencao">9. Retenção e exclusão</H2>
      <P>
        Mantemos os dados enquanto a conta estiver ativa e pelo prazo necessário para cumprir
        obrigações legais. Após o encerramento, os dados podem ser eliminados ou anonimizados,
        ressalvadas as hipóteses de guarda obrigatória previstas em lei.
      </P>

      <H2 id="direitos">10. Seus direitos</H2>
      <P>
        Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade,
        eliminação e informações sobre compartilhamento, entre outros direitos previstos na LGPD.
        Detalhes e como exercer estão na nossa página de <a className="text-brand-600 underline" href="/lgpd">LGPD</a>.
      </P>

      <H2 id="contato">11. Como falar conosco</H2>
      <P>
        Para dúvidas ou solicitações relativas a privacidade e proteção de dados, fale com o nosso
        encarregado (DPO) por <a className="text-brand-600" href="mailto:privacidade@gestaozap.digital">privacidade@gestaozap.digital</a>{' '}
        ou pelo WhatsApp <a className="text-brand-600" href="https://wa.me/5531995637020" target="_blank" rel="noopener noreferrer">(31) 99563-7020</a>.
      </P>
    </LegalLayout>
  );
}
