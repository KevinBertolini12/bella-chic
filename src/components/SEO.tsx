import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useSettings } from '../contexts/SettingsContext';
import { useSalon } from '../contexts/SalonContext';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  path?: string;
}

export const SEO = ({ title, description, image, path = '' }: SEOProps) => {
  const { settings } = useSettings();
  const { salon } = useSalon();
  
  const defaultTitle = settings?.branding?.name || 'Bella & Chic';
  const defaultDescription = settings?.branding?.shortDescription || 'Plataforma de agendamentos e loja para salões de beleza.';
  const defaultImage = settings?.branding?.logoURL || 'https://bellachic.com.br/og-image.jpg';
  const siteUrl = window.location.origin;
  const fullPath = path ? `${siteUrl}${path}` : window.location.href;

  const metaTitle = title ? `${title} | ${defaultTitle}` : defaultTitle;
  const metaDescription = description || defaultDescription;
  const metaImage = image || defaultImage;

  return (
    <Helmet>
      <title>{metaTitle}</title>
      <meta name="description" content={metaDescription} />
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={metaImage} />
      <meta property="og:url" content={fullPath} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={metaImage} />
      <link rel="canonical" href={fullPath} />
    </Helmet>
  );
};