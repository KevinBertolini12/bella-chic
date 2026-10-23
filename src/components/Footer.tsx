import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Instagram, Facebook, Mail, Phone, MapPin, Youtube, Music2, MessageCircle } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

export const Footer = () => {
  const { settings } = useSettings();
  const { slug } = useParams<{ slug: string }>();

  if (!settings) return null;

  const { branding, business, social } = settings;
  const baseUrl = `/s/${slug}`;

  const socialLinks = [
    { href: social.instagram,    icon: Instagram,      label: 'Instagram' },
    { href: social.facebook,     icon: Facebook,       label: 'Facebook' },
    { href: social.tiktok,       icon: Music2,         label: 'TikTok' },
    { href: social.youtube,      icon: Youtube,        label: 'YouTube' },
    { href: social.whatsappLink, icon: MessageCircle,  label: 'WhatsApp' },
  ].filter((s) => !!s.href);

  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">

          {/* Marca */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold tracking-tighter text-primary">
              {branding.footerName || branding.name}
            </h3>
            <p className="text-sm text-muted-foreground">{branding.shortDescription}</p>
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {socialLinks.map(({ href, icon: Icon, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Links rápidos */}
          <div>
            <h4 className="mb-4 font-semibold">Links Rápidos</h4>
            <ul className="space-y-2 text-sm">
              {[
                { label: 'Serviços',        path: `${baseUrl}/servicos` },
                { label: 'Equipe',          path: `${baseUrl}/equipe` },
                { label: 'Loja',            path: `${baseUrl}/loja` },
                { label: 'Agendar Horário', path: `${baseUrl}/agendamento` },
                { label: 'Sobre Nós',       path: `${baseUrl}/sobre` },
                { label: 'Avaliações',      path: `${baseUrl}/avaliacoes` },
              ].map(({ label, path }) => (
                <li key={path}>
                  <Link to={path} className="text-muted-foreground transition-colors hover:text-primary">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h4 className="mb-4 font-semibold">Atendimento</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {business.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" /> {business.phone}
                </li>
              )}
              {business.email && (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0" /> {business.email}
                </li>
              )}
              {business.address && (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {business.address}{business.number ? `, ${business.number}` : ''}<br />
                    {business.neighborhood && `${business.neighborhood} — `}
                    {business.city}/{business.state}
                    {business.zipCode && `, CEP ${business.zipCode}`}
                  </span>
                </li>
              )}
              {social.whatsappLink && (
                <li>
                  <a
                    href={social.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 font-medium text-green-600 hover:text-green-700"
                  >
                    <MessageCircle className="h-4 w-4" /> Fale pelo WhatsApp
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-4 font-semibold">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to={`${baseUrl}/privacidade`} className="text-muted-foreground hover:text-primary">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link to={`${baseUrl}/termos`} className="text-muted-foreground hover:text-primary">
                  Termos de Uso
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {branding.name}. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};