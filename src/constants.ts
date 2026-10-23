import { SalonSettings } from "./types";

export const DEFAULT_SALON_SETTINGS: SalonSettings = {
  branding: {
    name: "Bella & Chic",
    slogan: "Salão & Boutique",
    shortDescription: "Sua beleza em primeiro lugar.",
    fullDescription: "O melhor salão e boutique da região.",
    logoURL: "",
    faviconURL: "",
    headerName: "Bella & Chic",
    footerName: "Bella & Chic"
  },
  appearance: {
    primaryColor: "#000000",
    secondaryColor: "#ffffff",
    accentColor: "#f59e0b",
    buttonColor: "#000000",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    fontFamilyPrimary: "Inter",
    fontFamilySecondary: "Inter",
    buttonStyle: 'rounded',
    borderRadius: "0.5rem",
    theme: 'light',
    heroOverlayOpacity: 0.5
  },
  business: {
    slotInterval: 30,
    allowDelivery: true,
    phone: "(11) 99999-9999",
    whatsapp: "5511999999999",
    email: "contato@bellachic.com.br",
    address: "Rua das Flores, 123",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    zipCode: "01001-000",
    cnpj: "00.000.000/0001-00",
    workingHours: {
      monday: { open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00", closed: false },
      tuesday: { open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00", closed: false },
      wednesday: { open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00", closed: false },
      thursday: { open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00", closed: false },
      friday: { open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00", closed: false },
      saturday: { open: "09:00", close: "15:00", closed: false },
      sunday: { open: "00:00", close: "00:00", closed: true },
    },
    shippingFee: 12,
    allowPickup: true,
    pickupMessage: "Retire seu pedido em nossa loja física.",
    offerHomeService: false,
    homeServiceFee: 0,
  },
  social: {
    instagram: "https://instagram.com",
    facebook: "https://facebook.com",
    tiktok: "https://tiktok.com",
    youtube: "https://youtube.com",
    whatsappLink: "https://wa.me/5511999999999"
  },
  home: {
    hero: {
      heroLayout: 'background',
      title: "Beleza e Estilo",
      subtitle: "Salão & Boutique",
      description: "Transforme seu visual e renove seu guarda-roupa.",
      imageURL: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1920",
      button1Text: "Agendar Agora",
      button1Link: "/agendar",
      button2Text: "Ver Boutique",
      button2Link: "/loja"
    },
    benefits: [
      { icon: "Scissors", title: "Profissionais Qualificados", description: "Nossa equipe é treinada nas últimas tendências." },
      { icon: "ShoppingBag", title: "Boutique Exclusiva", description: "Peças selecionadas para você brilhar." }
    ],
    about: {
      title: "Sobre Nós",
      text: "A Bella & Chic nasceu do desejo de unir beleza e moda em um só lugar.",
      imageURL: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&q=80&w=800"
    },
    featuredServices: [],
    shopCTA: {
      title: "Nossa Boutique",
      description: "Confira as novidades da nossa loja.",
      imageURL: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1200",
      buttonText: "Ver Produtos"
    }
  },
  cms: {
    privacyPolicy: "Sua privacidade é importante para nós.",
    termsOfUse: "Termos de uso do nosso site.",
    aboutPage: "História completa da Bella & Chic.",
    contactText: "Entre em contato conosco."
  }
};

export const SHIPPING_FEE = 12;