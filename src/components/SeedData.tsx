import React from 'react';
import { collection, addDoc, getDocs, query, limit, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

export const SeedData = () => {
  const seed = async () => {
    try {
      // 1. Create Default Plans
      const plans = [
        { id: 'basic', name: 'Plano Básico', description: 'Ideal para profissionais autônomos.', price: 49.90, active: true, features: { maxProfessionals: 2, maxAppointmentsPerMonth: 100, hasStore: false, hasCustomDomain: false } },
        { id: 'pro', name: 'Plano Profissional', description: 'Para salões em crescimento.', price: 99.90, active: true, features: { maxProfessionals: 5, maxAppointmentsPerMonth: 500, hasStore: true, hasCustomDomain: false } },
        { id: 'premium', name: 'Plano Premium', description: 'A solução completa para o seu negócio.', price: 199.90, active: true, features: { maxProfessionals: 20, maxAppointmentsPerMonth: 2000, hasStore: true, hasCustomDomain: true } },
      ];

      for (const plan of plans) {
        const { id, ...planData } = plan;
        await setDoc(doc(db, 'plans', id), planData);
      }

      // 2. Create Default Salon (Bella & Chic)
      const salonId = 'bella-chic-id';
      const salonData = {
        name: 'Bella & Chic - Salão & Boutique',
        slug: 'bella-chic',
        ownerEmail: 'admin@bellachic.com',
        ownerId: 'admin-uid',
        status: 'ACTIVE',
        planId: 'premium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await setDoc(doc(db, 'salons', salonId), salonData);

      // 3. Create Default Settings for the Salon
      const settingsData = {
        branding: {
          name: 'Bella & Chic',
          logo: '',
          primaryColor: '#db2777',
          secondaryColor: '#f472b6',
          shortDescription: 'Sua beleza e estilo em um só lugar.',
          footerName: 'Bella & Chic - Salão & Boutique',
        },
        business: {
          phone: '(11) 99999-9999',
          email: 'contato@bellachic.com',
          address: 'Av. Paulista, 1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          openingHours: {
            monday: '09:00 - 18:00',
            tuesday: '09:00 - 18:00',
            wednesday: '09:00 - 18:00',
            thursday: '09:00 - 20:00',
            friday: '09:00 - 20:00',
            saturday: '09:00 - 17:00',
            sunday: 'Fechado',
          },
        },
        social: {
          instagram: 'https://instagram.com/bellachic',
          facebook: 'https://facebook.com/bellachic',
          tiktok: '',
          youtube: '',
        },
        appearance: {
          theme: 'light',
          fontFamily: 'Inter',
          borderRadius: '0.5rem',
        },
      };

      await setDoc(doc(db, `salons/${salonId}/settings`, 'general'), settingsData);

      // 4. Create Services for the Salon
      const services = [
        { name: 'Corte Feminino', description: 'Corte moderno com lavagem inclusa.', duration: 60, price: 120, active: true, category: 'Cabelo', salonId },
        { name: 'Escova Modelada', description: 'Escova com finalização profissional.', duration: 45, price: 80, active: true, category: 'Cabelo', salonId },
        { name: 'Design de Sobrancelha', description: 'Design personalizado conforme visagismo.', duration: 30, price: 45, active: true, category: 'Sobrancelha', salonId },
        { name: 'Manicure & Pedicure', description: 'Cutilagem e esmaltação completa.', duration: 90, price: 75, active: true, category: 'Unhas', salonId },
        { name: 'Extensão de Cílios', description: 'Fio a fio clássico ou volume russo.', duration: 120, price: 180, active: true, category: 'Cílios', salonId },
      ];

      const serviceIds: string[] = [];
      for (const s of services) {
        const docRef = await addDoc(collection(db, `salons/${salonId}/services`), s);
        serviceIds.push(docRef.id);
      }

      // 5. Create Professionals for the Salon
      const professionals = [
        { userId: 'admin-uid', displayName: 'Ana (Dona)', bio: 'Especialista em visagismo e cortes modernos.', specialties: [serviceIds[0], serviceIds[1], serviceIds[2]], active: true, photoURL: 'https://i.pravatar.cc/150?u=ana', salonId },
        { userId: 'prof1-uid', displayName: 'Juliana', bio: 'Manicure apaixonada por nail art e cuidados.', specialties: [serviceIds[3]], active: true, photoURL: 'https://i.pravatar.cc/150?u=juliana', salonId },
        { userId: 'prof2-uid', displayName: 'Carla', bio: 'Especialista em cílios e olhar marcante.', specialties: [serviceIds[4]], active: true, photoURL: 'https://i.pravatar.cc/150?u=carla', salonId },
      ];

      for (const p of professionals) {
        await addDoc(collection(db, `salons/${salonId}/professionals`), p);
      }

      // 6. Create Products for the Salon
      const products = [
        { name: 'Vestido Floral Verão', description: 'Vestido leve e fresco para dias ensolarados.', price: 189.90, stock: 10, category: 'Vestidos', images: ['https://picsum.photos/seed/dress1/400/600'], active: true, createdAt: Date.now(), salonId },
        { name: 'Blusa de Seda Elegance', description: 'Blusa sofisticada para ocasiões especiais.', price: 129.90, stock: 5, category: 'Blusas', images: ['https://picsum.photos/seed/blouse1/400/600'], active: true, createdAt: Date.now(), salonId },
        { name: 'Calça Jeans Skinny', description: 'Calça jeans com elastano de alta qualidade.', price: 159.90, stock: 8, category: 'Calças', images: ['https://picsum.photos/seed/jeans1/400/600'], active: true, createdAt: Date.now(), salonId },
      ];

      for (const pr of products) {
        await addDoc(collection(db, `salons/${salonId}/products`), pr);
      }

      toast.success('Dados iniciais carregados com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar dados iniciais.');
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-muted/50 mt-8">
      <h3 className="font-bold mb-2">Desenvolvimento: Carga de Dados SaaS</h3>
      <p className="text-sm text-muted-foreground mb-4">Clique no botão abaixo para popular o banco de dados com planos e o salão Bella & Chic de exemplo.</p>
      <Button onClick={seed}>Carregar Dados Iniciais</Button>
    </div>
  );
};
