import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { 
  SalonSettings, 
  BrandingSettings, 
  AppearanceSettings, 
  BusinessSettings, 
  SocialSettings, 
  HomeSettings, 
  CMSSettings 
} from '../types';
import { handleFirestoreError, OperationType } from '../utils/firebaseError';

export const settingsService = {
  async getSettings(salonId: string): Promise<SalonSettings> {
    try {
      const brandingDoc = await getDoc(doc(db, `salons/${salonId}/settings`, 'branding'));
      const appearanceDoc = await getDoc(doc(db, `salons/${salonId}/settings`, 'appearance'));
      const businessDoc = await getDoc(doc(db, `salons/${salonId}/settings`, 'business'));
      const socialDoc = await getDoc(doc(db, `salons/${salonId}/settings`, 'social'));
      const homeDoc = await getDoc(doc(db, `salons/${salonId}/settings`, 'home'));
      const cmsDoc = await getDoc(doc(db, `salons/${salonId}/settings`, 'cms'));

      return {
        branding: brandingDoc.exists() ? brandingDoc.data() as BrandingSettings : this.getDefaultBranding(),
        appearance: appearanceDoc.exists() ? appearanceDoc.data() as AppearanceSettings : this.getDefaultAppearance(),
        business: businessDoc.exists() ? businessDoc.data() as BusinessSettings : this.getDefaultBusiness(),
        social: socialDoc.exists() ? socialDoc.data() as SocialSettings : this.getDefaultSocial(),
        home: homeDoc.exists() ? homeDoc.data() as HomeSettings : this.getDefaultHome(),
        cms: cmsDoc.exists() ? cmsDoc.data() as CMSSettings : this.getDefaultCMS(),
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `salons/${salonId}/settings`);
      throw error;
    }
  },

  async updateSettings(salonId: string, section: keyof SalonSettings, data: any) {
    try {
      const settingsRef = doc(db, `salons/${salonId}/settings`, section);
      await setDoc(settingsRef, data, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `salons/${salonId}/settings/${section}`);
    }
  },


  async uploadImage(file: File, path: string): Promise<string> {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  },

  getDefaultBranding(): BrandingSettings {
    return {
      name: 'Bella & Chic',
      slogan: 'Realce sua beleza, vista seu estilo.',
      shortDescription: 'Sua beleza e estilo em um só lugar.',
      fullDescription: 'O salão de beleza e boutique que você sempre sonhou.',
      logoURL: '',
      faviconURL: '',
      headerName: 'Bella & Chic',
      footerName: 'Bella & Chic',
    };
  },

  getDefaultAppearance(): AppearanceSettings {
    return {
      primaryColor: '#e11d48', // rose-600
      secondaryColor: '#4c1d95', // violet-900
      accentColor: '#f43f5e', // rose-500
      buttonColor: '#e11d48',
      backgroundColor: '#ffffff',
      textColor: '#0f172a', // slate-900
      fontFamilyPrimary: 'Inter',
      fontFamilySecondary: 'Inter',
      buttonStyle: 'rounded',
      borderRadius: '0.5rem',
      theme: 'light',
      heroOverlayOpacity: 0.5,
    };
  },

  getDefaultBusiness(): BusinessSettings {
    return {
      allowDelivery: true,
      offerHomeService: false,
      homeServiceFee: 0,
      phone: '(11) 99999-9999',
      whatsapp: '(11) 99999-9999',
      email: 'contato@bellachic.com.br',
      address: 'Rua das Flores',
      number: '123',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001-000',
      cnpj: '',
      workingHours: {
        monday: { open: '09:00', close: '18:00', closed: false },
        tuesday: { open: '09:00', close: '18:00', closed: false },
        wednesday: { open: '09:00', close: '18:00', closed: false },
        thursday: { open: '09:00', close: '18:00', closed: false },
        friday: { open: '09:00', close: '18:00', closed: false },
        saturday: { open: '09:00', close: '14:00', closed: false },
        sunday: { open: '00:00', close: '00:00', closed: true },
      },
      slotInterval: 10, // padrão 10 minutos
      shippingFee: 15,
      allowPickup: true,
      pickupMessage: 'Retirada disponível no balcão.',
    };
  },

  getDefaultSocial(): SocialSettings {
    return {
      instagram: '',
      facebook: '',
      tiktok: '',
      youtube: '',
      whatsappLink: '',
    };
  },

  getDefaultHome(): HomeSettings {
    return {
      hero: {
        heroLayout: 'background',
        title: 'Realce sua beleza, vista seu estilo.',
        subtitle: 'O salão de beleza e boutique que você sempre sonhou.',
        description: 'Agora com agendamento online e loja virtual completa.',
        imageURL: 'https://picsum.photos/seed/salon/1920/1080',
        button1Text: 'Agendar Agora',
        button1Link: '/agendamento',
        button2Text: 'Ver Loja',
        button2Link: '/loja',
      },
      benefits: [
        { icon: 'Star', title: 'Excelência', description: 'Profissionais altamente qualificados para cada serviço.' },
        { icon: 'Clock', title: 'Agilidade', description: 'Agendamento rápido e prático pelo seu celular.' },
        { icon: 'ShieldCheck', title: 'Segurança', description: 'Ambiente higienizado e produtos de alta qualidade.' },
        { icon: 'Heart', title: 'Estilo', description: 'Boutique exclusiva com as últimas tendências.' },
      ],
      about: {
        title: 'Sobre a Bella & Chic',
        text: 'Nossa história começou com o desejo de unir beleza e moda em um só lugar...',
        imageURL: 'https://picsum.photos/seed/fashion/800/600',
      },
      featuredServices: [],
      shopCTA: {
        title: 'Boutique Bella & Chic',
        description: 'Confira nossa nova coleção de roupas femininas. Peças exclusivas para você se sentir linda em qualquer ocasião.',
        imageURL: 'https://picsum.photos/seed/fashion/800/600',
        buttonText: 'Explorar Coleção',
      },
    };
  },

  getDefaultCMS(): CMSSettings {
    return {
      privacyPolicy: '# Política de Privacidade\n\nSua privacidade é importante para nós...',
      termsOfUse: '# Termos de Uso\n\nAo usar nosso site, você concorda com...',
      aboutPage: '# Nossa História\n\nFundada em 2015...',
      contactText: 'Estamos prontos para te atender!',
    };
  },
};
