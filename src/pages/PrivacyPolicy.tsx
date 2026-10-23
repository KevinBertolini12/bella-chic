import React from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';

export const PrivacyPolicy = () => {
  return (
    <>
      <SEO title="Política de Privacidade" description="Política de privacidade da plataforma Bella & Chic — LGPD" />
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary mb-8 inline-block">← Voltar</Link>
        <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground text-sm mb-1">Última atualização: abril de 2026</p>
        <p className="text-muted-foreground text-xs mb-10">Em conformidade com a Lei Geral de Proteção de Dados — LGPD (Lei nº 13.709/2018)</p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Identificação do Controlador</h2>
            <p>A <strong>Bella & Chic</strong> é uma plataforma SaaS de gestão para negócios de serviços, incluindo salões, barbearias, clínicas, estúdios, academias, consultórios e similares, operada por <strong>Kevin Benjolim</strong> (CPF protegido), com sede em Pontal, São Paulo, Brasil.</p>
            <p className="mt-2">📧 <a href="mailto:bellachic.plataforma@gmail.com" className="text-primary hover:underline">bellachic.plataforma@gmail.com</a></p>
            <p>💬 <a href="https://wa.me/5516994563374" target="_blank" rel="noreferrer" className="text-primary hover:underline">+55 16 99456-3374</a></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Encarregado de Proteção de Dados (DPO)</h2>
            <p>Nosso Encarregado de Dados (Data Protection Officer) pode ser contatado pelo e-mail: <a href="mailto:bellachic.plataforma@gmail.com" className="text-primary hover:underline">bellachic.plataforma@gmail.com</a></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Quais dados coletamos e por quê</h2>
            <div className="overflow-x-auto">
              <table className="w-full border text-xs mt-2">
                <thead className="bg-muted">
                  <tr>
                    <th className="border p-2 text-left">Dado</th>
                    <th className="border p-2 text-left">Finalidade</th>
                    <th className="border p-2 text-left">Base legal</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Nome e e-mail', 'Cadastro e login', 'Execução de contrato'],
                    ['Telefone/WhatsApp', 'Envio de lembretes e notificações', 'Execução de contrato'],
                    ['Dados do estabelecimento', 'Personalização da plataforma', 'Execução de contrato'],
                    ['Dados de agendamentos', 'Operação do sistema de agenda', 'Execução de contrato'],
                    ['Dados financeiros', 'Processamento via Stripe/Asaas', 'Execução de contrato'],
                    ['Dados de clientes finais', 'Gestão do negócio do assinante', 'Legítimo interesse'],
                    ['Dados de navegação', 'Melhoria da plataforma', 'Legítimo interesse'],
                    ['Cookies essenciais', 'Manutenção de sessão', 'Legítimo interesse'],
                  ].map(([d, f, b]) => (
                    <tr key={d}>
                      <td className="border p-2">{d}</td>
                      <td className="border p-2">{f}</td>
                      <td className="border p-2">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Dados de clientes finais (responsabilidade do assinante)</h2>
            <p>Os assinantes da plataforma (donos de negócio) inserem dados de seus próprios clientes (nome, telefone, histórico de atendimentos). Nesses casos, o <strong>assinante é o controlador</strong> e a Bella & Chic atua como <strong>operadora</strong>, nos termos do art. 39 da LGPD. O assinante é integralmente responsável pela coleta, guarda e uso desses dados em conformidade com a lei.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Compartilhamento de dados</h2>
            <p className="mb-2">Não vendemos dados. Compartilhamos apenas com parceiros essenciais para operação:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Firebase / Google Cloud</strong> — banco de dados e autenticação (EUA — cláusulas contratuais padrão)</li>
              <li><strong>Stripe</strong> — processamento de assinaturas (EUA — certificado Privacy Shield)</li>
              <li><strong>Asaas</strong> — PIX automático (Brasil)</li>
              <li><strong>Cloudinary</strong> — armazenamento de imagens (EUA — cláusulas contratuais padrão)</li>
              <li><strong>Groq</strong> — processamento de IA para bot (EUA — não armazena conversas)</li>
              <li><strong>Baileys (WhatsApp)</strong> — envio de notificações (processado localmente no servidor)</li>
            </ul>
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠️ Transferências internacionais: dados podem ser processados fora do Brasil por provedores listados acima, todos com garantias adequadas de proteção.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Cookies e rastreamento</h2>
            <p className="mb-2">Utilizamos apenas <strong>cookies essenciais</strong>:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Sessão de autenticação</strong> — mantém você logado (Firebase Auth)</li>
              <li><strong>Preferências de idioma e tema</strong> — armazenados localmente no dispositivo</li>
            </ul>
            <p className="mt-2">Não utilizamos cookies de rastreamento, publicidade ou analytics de terceiros. Nosso produto é livre de anúncios.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Seus direitos pela LGPD</h2>
            <p className="mb-2">Você tem os seguintes direitos, exercíveis pelo e-mail acima:</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ['🔍 Acesso', 'Ver quais dados temos sobre você'],
                ['✏️ Correção', 'Atualizar dados incorretos'],
                ['🗑️ Eliminação', 'Excluir seus dados pessoais'],
                ['📋 Portabilidade', 'Receber seus dados em formato estruturado'],
                ['🚫 Oposição', 'Opor-se ao tratamento baseado em legítimo interesse'],
                ['ℹ️ Informação', 'Saber com quem seus dados são compartilhados'],
                ['↩️ Revogação', 'Revogar consentimentos dados'],
                ['⚖️ Revisão', 'Revisar decisões automatizadas'],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-lg border p-2.5 text-xs">
                  <p className="font-semibold text-foreground">{title}</p>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs">Prazo de resposta: até <strong>15 dias úteis</strong> conforme art. 18 da LGPD. Você também pode acionar a ANPD (Autoridade Nacional de Proteção de Dados): <a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer" className="text-primary hover:underline">www.gov.br/anpd</a></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Segurança</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Autenticação segura via Firebase Auth (criptografia AES-256)</li>
              <li>Comunicação criptografada via HTTPS/TLS</li>
              <li>Dados de cartão nunca armazenados — processados diretamente pelo Stripe (PCI-DSS)</li>
              <li>Acesso aos dados restrito por papéis (SUPER_ADMIN, SALON_ADMIN, PROFESSIONAL, CLIENT)</li>
              <li>Backups automáticos pelo Firebase</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Retenção de dados</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Conta ativa: dados mantidos enquanto a assinatura estiver ativa</li>
              <li>Após cancelamento: dados disponíveis por 30 dias para exportação</li>
              <li>Exclusão definitiva: até 90 dias após o cancelamento</li>
              <li>Dados financeiros: mantidos por 5 anos (obrigação fiscal — Lei nº 9.613/1998)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Menores de idade</h2>
            <p>Nossa plataforma é destinada a pessoas com 18 anos ou mais. Não coletamos intencionalmente dados de menores. Se identificarmos dados de menores coletados sem consentimento, excluiremos imediatamente.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Alterações nesta política</h2>
            <p>Podemos atualizar esta política. Alterações relevantes serão comunicadas por e-mail com 15 dias de antecedência. A data no topo indica a versão vigente.</p>
          </section>

        </div>
      </div>
    </>
  );
};
