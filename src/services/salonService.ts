import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { SalonService, Professional, Appointment, AppointmentStatus, Salon, Plan, ContactMessage } from '../types';

// Remove campos undefined — Firestore não aceita undefined
function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

export const salonService = {
  // Salons
  async getSalonBySlug(slug: string) {
    const q = query(collection(db, 'salons'), where('slug', '==', slug));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Salon;
  },

  async getSalonById(id: string) {
    const docRef = doc(db, 'salons', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Salon : null;
  },

  async getAllSalons() {
    const snapshot = await getDocs(collection(db, 'salons'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Salon));
  },

  // Plans
  async getPlans() {
    const snapshot = await getDocs(collection(db, 'plans'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan));
  },

  async getPlanById(id: string) {
    const docRef = doc(db, 'plans', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Plan : null;
  },

  // Services
  async getServices(salonId: string) {
    const q = query(collection(db, `salons/${salonId}/services`), where('active', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalonService));
  },

  async addService(salonId: string, service: Omit<SalonService, 'id' | 'salonId'>) {
    return await addDoc(collection(db, `salons/${salonId}/services`), removeUndefined({ ...service, salonId }));
  },

  async updateService(salonId: string, id: string, service: Partial<SalonService>) {
    const docRef = doc(db, `salons/${salonId}/services`, id);
    return await updateDoc(docRef, removeUndefined(service));
  },

  async deleteService(salonId: string, id: string) {
    const docRef = doc(db, `salons/${salonId}/services`, id);
    return await deleteDoc(docRef);
  },

  // Professionals
  async getProfessionals(salonId: string, activeOnly = true) {
    let q = query(collection(db, `salons/${salonId}/professionals`));
    if (activeOnly) {
      q = query(q, where('active', '==', true));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Professional));
  },

  async addProfessional(salonId: string, professional: Omit<Professional, 'id' | 'salonId'>) {
    return await addDoc(collection(db, `salons/${salonId}/professionals`), removeUndefined({ ...professional, salonId }));
  },

  async updateProfessional(salonId: string, id: string, professional: Partial<Professional>) {
    const docRef = doc(db, `salons/${salonId}/professionals`, id);
    return await updateDoc(docRef, removeUndefined(professional));
  },

  async deleteProfessional(salonId: string, id: string) {
    const docRef = doc(db, `salons/${salonId}/professionals`, id);
    return await deleteDoc(docRef);
  },

  async getProfessionalById(salonId: string, id: string) {
    const docRef = doc(db, `salons/${salonId}/professionals`, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Professional : null;
  },

  // Appointments
  async createAppointment(salonId: string, appointment: Omit<Appointment, 'id' | 'salonId'>) {
    return await addDoc(collection(db, `salons/${salonId}/appointments`), removeUndefined({ ...appointment, salonId }));
  },

  async getAppointmentsAdmin(salonId: string) {
    const q = query(collection(db, `salons/${salonId}/appointments`), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
  },

  async getAppointmentsByProfessional(salonId: string, professionalId: string, date?: string) {
    let q = query(
      collection(db, `salons/${salonId}/appointments`),
      where('professionalId', '==', professionalId)
    );
    if (date) {
      q = query(q, where('date', '==', date));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
  },

  async getAppointmentsByClient(salonId: string, clientId: string, phone?: string) {
    // Busca pelo clientId (usuários logados)
    const q = query(
      collection(db, `salons/${salonId}/appointments`),
      where('clientId', '==', clientId),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    const byId = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));

    // Se tiver telefone, busca também por phone para pegar agendamentos feitos como visitante
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      const qPhone = query(
        collection(db, `salons/${salonId}/appointments`),
        where('customerPhone', '==', phone)
      );
      const snapPhone = await getDocs(qPhone);
      const byPhone = snapPhone.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
        .filter(apt => !byId.find(a => a.id === apt.id)); // evita duplicatas

      const merged = [...byId, ...byPhone];
      merged.sort((a, b) => (a.date < b.date ? 1 : -1));
      return merged;
    }

    return byId;
  },

  /**
   * Busca agendamentos pelo número de celular do cliente.
   * Usado pelo portal sem conta (GuestAppointments).
   * Tenta variações do número para cobrir formatos diferentes (com/sem 55, com/sem 9 extra).
   */
  async getAppointmentsByPhone(salonId: string, phone: string): Promise<Appointment[]> {
    // Normaliza: só dígitos, sem DDI
    const digits = phone.replace(/\D/g, '');
    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;

    // Gera variações para cobrir formatos salvos de formas diferentes
    const variations = new Set<string>();
    variations.add(withoutCountry);                          // 11999998888
    variations.add(`55${withoutCountry}`);                   // 5511999998888
    variations.add(`(${withoutCountry.slice(0,2)}) ${withoutCountry.slice(2,7)}-${withoutCountry.slice(7)}`); // (11) 99999-8888
    variations.add(`(${withoutCountry.slice(0,2)}) ${withoutCountry.slice(2,6)}-${withoutCountry.slice(6)}`); // (11) 9999-8888

    // Busca por todas as variações em paralelo
    const promises = Array.from(variations).map(v =>
      getDocs(query(
        collection(db, `salons/${salonId}/appointments`),
        where('customerPhone', '==', v)
      ))
    );

    const results = await Promise.all(promises);

    // Deduplica por ID e ordena por data desc
    const seen = new Set<string>();
    const appointments: Appointment[] = [];
    for (const snapshot of results) {
      for (const d of snapshot.docs) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          appointments.push({ id: d.id, ...d.data() } as Appointment);
        }
      }
    }

    return appointments.sort((a, b) => b.date.localeCompare(a.date));
  },

  async updateAppointmentStatus(salonId: string, id: string, status: AppointmentStatus) {
    const docRef = doc(db, `salons/${salonId}/appointments`, id);
    return await updateDoc(docRef, { status, updatedAt: Date.now() });
  },

  // Atualiza campos arbitrários de um agendamento (usado ao mover na agenda)
  async updateAppointment(salonId: string, id: string, changes: Record<string, any>) {
    const docRef = doc(db, `salons/${salonId}/appointments`, id);
    return await updateDoc(docRef, { ...changes, updatedAt: Date.now() });
  },

  async rescheduleAppointment(salonId: string, id: string, newDate: string, newStartTime: string, newEndTime: string) {
    const docRef = doc(db, `salons/${salonId}/appointments`, id);
    return await updateDoc(docRef, {
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      status: 'RESCHEDULED',
      updatedAt: Date.now(),
    });
  },

  // Contact messages
  async createContactMessage(
    salonId: string,
    message: Omit<ContactMessage, 'id' | 'salonId' | 'createdAt' | 'status'>
  ) {
    return await addDoc(collection(db, `salons/${salonId}/contact_messages`), removeUndefined({
      ...message,
      salonId,
      status: 'NEW',
      createdAt: Date.now(),
    }));
  },

  async getContactMessages(salonId: string) {
    const q = query(collection(db, `salons/${salonId}/contact_messages`), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactMessage));
  },

  async updateContactMessageStatus(salonId: string, id: string, status: ContactMessage['status']) {
    const docRef = doc(db, `salons/${salonId}/contact_messages`, id);
    return await updateDoc(docRef, { status });
  }
};
