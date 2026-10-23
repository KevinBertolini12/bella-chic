import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Button } from '../components/ui/button';
import { Mail, Phone, MapPin, Instagram, Facebook, MessageCircle, Music2, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { useSettings } from '../contexts/SettingsContext';
import { useSalon } from '../contexts/SalonContext';
import { salonService } from '../services/salonService';
import { SEO } from '../components/SEO';

export const Contact = () => {
  const { settings } = useSettings();
  const { salonId } = useSalon();
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!salonId) {
      toast.error('Não foi possível identificar o salão para registrar sua mensagem.');
      return;
    }

    setSending(true);

    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const phone = (form.elements.namedItem('phone') as HTMLInputElement).value.trim();
    const subject = (form.elements.namedItem('subject') as HTMLInputElement).value.trim();
    const message = (form.elements.namedItem('message') as HTMLTextAreaElement).value.trim();

    try {
      await salonService.createContactMessage(salonId, {
        name,
        email,
        phone,
        subject,
        message,
      });

      if (settings?.business?.whatsapp) {
        const whatsappNumber = settings.business.whatsapp.replace(/\D/g, '');
        const msg = encodeURIComponent(`Olá! Sou ${name}. Assunto: ${subject}. Mensagem: ${message}`);
        window.open(`https://wa.me/${whatsappNumber}?text=${msg}`, '_blank');
      }

      toast.success('Mensagem enviada com sucesso!');
      form.reset();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível enviar sua mensagem. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const business  = settings?.business;
  const social    = settings?.social;
  const cms       = settings?.cms;

  const socialLinks = [
    { href: social?.instagram,    icon: Instagram,      label: 'Instagram' },
    { href: social?.facebook,     icon: Facebook,       label: 'Facebook' },
    { href: social?.tiktok,       icon: Music2,         label: 'TikTok' },
    { href: social?.youtube,      icon: Youtube,        label: 'YouTube' },
    { href: social?.whatsappLink, icon: MessageCircle,  label: 'WhatsApp' },
  ].filter((s) => !!s.href);

  return (
    <>
      <SEO title="Contato" description="Entre em contato conosco" />
      <div className="container mx-auto px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Fale Conosco</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            {cms?.contactText || 'Tem alguma dúvida? Estamos aqui para ajudar.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Informações de contato (mesmo código) */}
          <div className="space-y-6">
            {business?.phone && (
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
                <Card className="border-none bg-muted/30 shadow-sm">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Phone className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold">Telefone</h3>
                      <a href={`tel:${business.phone.replace(/\D/g, '')}`} className="text-muted-foreground hover:text-primary">
                        {business.phone}
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {business?.whatsapp && (
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                <Card className="border-none bg-muted/30 shadow-sm">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                      <MessageCircle className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold">WhatsApp</h3>
                      {social?.whatsappLink ? (
                        <a href={social.whatsappLink} target="_blank" rel="noreferrer" className="font-medium text-green-600 hover:text-green-700">
                          Falar pelo WhatsApp →
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{business.whatsapp}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {business?.email && (
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
                <Card className="border-none bg-muted/30 shadow-sm">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Mail className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold">E-mail</h3>
                      <a href={`mailto:${business.email}`} className="text-muted-foreground hover:text-primary">
                        {business.email}
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {business?.address && (
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                <Card className="border-none bg-muted/30 shadow-sm">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold">Endereço</h3>
                      <p className="text-muted-foreground">
                        {business.address}{business.number ? `, ${business.number}` : ''}<br />
                        {business.neighborhood && `${business.neighborhood} — `}
                        {business.city}/{business.state}
                        {business.zipCode && `, CEP ${business.zipCode}`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Google Maps embed baseado no endereço */}
            {business?.address && business?.city && (
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
                <div className="overflow-hidden rounded-xl border shadow-sm">
                  <iframe
                    title="Localização no mapa"
                    width="100%"
                    height="220"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(
                      [business.address, business.number, business.neighborhood, business.city, business.state]
                        .filter(Boolean).join(', ')
                    )}&output=embed`}
                  />
                </div>
              </motion.div>
            )}

            {socialLinks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold">Siga-nos</h3>
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map(({ href, icon: Icon, label }) => (
                    <a
                      key={label}
                      href={href!}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={label}
                      className="flex h-10 w-10 items-center justify-center rounded-full border transition-colors hover:border-primary hover:text-primary"
                    >
                      <Icon className="h-5 w-5" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Formulário */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Envie uma Mensagem</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input id="name" name="name" placeholder="Seu nome" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" placeholder="seu@email.com" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">WhatsApp / Telefone</Label>
                  <Input id="phone" name="phone" placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto</Label>
                  <Input id="subject" name="subject" placeholder="Como podemos ajudar?" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem</Label>
                  <Textarea id="message" name="message" placeholder="Escreva sua mensagem aqui..." className="min-h-[140px]" required />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={sending}>
                  {sending ? 'Enviando...' : 'Enviar Mensagem'}
                </Button>
                {business?.whatsapp && (
                  <p className="text-center text-xs text-muted-foreground">
                    Ao enviar, você poderá ser redirecionado para o WhatsApp do salão.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};