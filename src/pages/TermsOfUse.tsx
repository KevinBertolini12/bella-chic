import React from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';

export const TermsOfUse = () => {
  return (
    <>
      <SEO title="Termos de Uso" description="Termos de uso da plataforma Bella & Chic" />
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary mb-8 inline-block">← Voltar</Link>
        <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-muted-foreground text-sm mb-10">Última atualização: abril de 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Aceitação dos termos</h2>
            <p>Ao criar uma conta ou utilizar a plataforma <strong>Bella & Chic</strong>, você declara ter lido, compreendido e aceito estes Termos de Uso em sua totalidade. Se não concordar com qualquer parte, não utilize o serviço.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. O que é a Bella & Chic</h2>
            <p>A Bella & Chic é uma plataforma SaaS (Software as a Service) de gestão para negócios de serviços, incluindo salões de beleza, barbearias, clínicas, estúdios, academias, consultórios e qualquer profissional autônomo ou empresa que realize atendimentos por agendamento.</p>
            <p className="mt-2">Funcionalidades disponíveis conforme o plano contratado: agendamento online 24h, loja virtual integrada, CRM de relacionamento, bot WhatsApp com IA, relatórios financeiros, anamnese digital, prontuários, programa de fidelidade e muito mais.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Cadastro e responsabilidades da conta</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Você deve ter 18 anos ou mais para criar uma conta</li>
              <li>As informações fornecidas devem ser verdadeiras, completas e atualizadas</li>
              <li>Você é inteiramente responsável pela segurança da sua senha e pelo uso da conta</li>
              <li>Em caso de acesso não autorizado, notifique-nos imediatamente</li>
              <li>É vedada a cessão, venda ou compartilhamento de credenciais de acesso</li>
              <li>A Bella & Chic pode suspender contas com informações falsas ou suspeitas de fraude</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Planos, período de teste e pagamentos</h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Trial:</strong> 30 dias gratuitos, sem necessidade de cartão de crédito</li>
              <li>Após o trial, é necessário assinar um plano pago para continuar usando</li>
              <li>Os planos são cobrados mensalmente via Stripe (cartão) ou outros meios disponíveis</li>
              <li>Não há fidelidade mínima — você pode cancelar a qualquer momento pelo painel</li>
              <li>Não realizamos reembolsos de períodos já iniciados e cobrados, salvo erro comprovado da plataforma</li>
              <li>Reajustes de preço serão comunicados com 30 dias de antecedência por e-mail</li>
              <li>Em caso de inadimplência, o acesso é suspenso após aviso de 7 dias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Uso do WhatsApp integrado</h2>
            <p className="mb-2">A plataforma oferece integração com WhatsApp via protocolo oficial do WhatsApp (Baileys). Ao utilizar esta funcionalidade:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Você é responsável por obter consentimento dos seus clientes para receber mensagens automatizadas</li>
              <li>É vedado o uso do bot para envio de spam ou mensagens não solicitadas</li>
              <li>O número conectado deve ser de sua propriedade ou devidamente autorizado</li>
              <li>A Bella & Chic não se responsabiliza por bloqueios de número causados por uso inadequado</li>
              <li>O uso do bot deve respeitar os Termos de Serviço do WhatsApp</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Dados dos clientes finais (LGPD)</h2>
            <p>Você, como assinante e dono do negócio, é o <strong>controlador</strong> dos dados pessoais dos seus clientes inseridos na plataforma. Você se compromete a:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Coletar e tratar dados dos seus clientes em conformidade com a LGPD</li>
              <li>Obter consentimento quando necessário</li>
              <li>Não inserir dados sensíveis além dos necessários para o atendimento</li>
              <li>Respeitar pedidos de exclusão de dados dos seus clientes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Uso aceitável</h2>
            <p className="mb-2">É expressamente vedado utilizar a Bella & Chic para:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Atividades ilegais, fraudulentas ou que violem direitos de terceiros</li>
              <li>Envio de spam, phishing ou conteúdo enganoso</li>
              <li>Tentativas de acesso não autorizado a sistemas ou dados</li>
              <li>Revenda não autorizada do serviço</li>
              <li>Uso de bots ou automações para sobrecarregar a infraestrutura</li>
              <li>Qualquer atividade que prejudique outros usuários ou a plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Conteúdo inserido pelo usuário</h2>
            <p>Você é o único responsável por fotos, descrições, preços e qualquer conteúdo inserido na plataforma. A Bella & Chic pode remover conteúdo que viole estes termos, seja ofensivo ou ilegal, sem aviso prévio e sem responsabilidade de indenização.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Disponibilidade e SLA</h2>
            <p>Nos comprometemos a manter disponibilidade mínima de <strong>99% ao mês</strong>. Manutenções programadas serão comunicadas com 24h de antecedência pelo WhatsApp de suporte. Não nos responsabilizamos por perdas decorrentes de indisponibilidade causada por força maior, falhas de terceiros (Google Firebase, Stripe, etc.) ou ataques externos.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Propriedade intelectual</h2>
            <p>Todo o código-fonte, design, marca, logotipo e conteúdo da plataforma Bella & Chic são de propriedade exclusiva de seu desenvolvedor. É vedada cópia, engenharia reversa, reprodução total ou parcial sem autorização expressa por escrito.</p>
            <p className="mt-2">O assinante retém a propriedade de seus próprios dados e conteúdo inserido na plataforma.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Cancelamento e exclusão de dados</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Você pode cancelar a qualquer momento pelo painel → Assinatura → Cancelar</li>
              <li>Após o cancelamento, seu acesso permanece ativo até o fim do período já pago</li>
              <li>Seus dados ficam disponíveis por 30 dias para exportação após o encerramento</li>
              <li>Após 90 dias, todos os dados são excluídos permanentemente de nossos servidores</li>
              <li>A Bella & Chic pode encerrar contas que violem estes termos, com ou sem aviso prévio</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">12. Limitação de responsabilidade</h2>
            <p>A Bella & Chic não se responsabiliza por: lucros cessantes, danos indiretos, perda de clientes ou receita decorrente do uso ou impossibilidade de uso da plataforma. Nossa responsabilidade total em qualquer circunstância é limitada ao valor pago pelo plano no mês em questão.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">13. Alterações nos termos</h2>
            <p>Podemos atualizar estes Termos a qualquer momento. Alterações significativas serão comunicadas por e-mail com <strong>30 dias de antecedência</strong>. O uso continuado após esse prazo implica aceitação dos novos termos.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">14. Lei aplicável e foro</h2>
            <p>Estes Termos são regidos pela legislação brasileira, em especial o Código de Defesa do Consumidor (Lei 8.078/90), o Marco Civil da Internet (Lei 12.965/14) e a LGPD (Lei 13.709/18). Fica eleito o foro da comarca de <strong>Pontal, São Paulo</strong>, para dirimir quaisquer controvérsias, com renúncia expressa a qualquer outro.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">15. Contato e suporte</h2>
            <p>📧 <a href="mailto:bellachic.plataforma@gmail.com" className="text-primary hover:underline">bellachic.plataforma@gmail.com</a></p>
            <p>💬 <a href="https://wa.me/5516994563374" target="_blank" rel="noreferrer" className="text-primary hover:underline">+55 16 99456-3374</a></p>
            <p className="mt-2 text-xs">Horário de atendimento humano: segunda a sexta, 9h–18h (horário de Brasília)</p>
          </section>

        </div>
      </div>
    </>
  );
};
