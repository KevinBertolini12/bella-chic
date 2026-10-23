import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Salon, Plan, Subscription, UserProfile } from '../types';

export const superAdminService = {
  // Salons Management
  async getAllSalons() {
    const snapshot = await getDocs(collection(db, 'salons'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Salon));
  },

  async updateSalon(id: string, data: Partial<Salon>) {
    const docRef = doc(db, 'salons', id);
    return await updateDoc(docRef, data);
  },

  async createSalon(salon: Omit<Salon, 'id'>) {
    return await addDoc(collection(db, 'salons'), salon);
  },

  // Plans Management
  async getAllPlans() {
    const snapshot = await getDocs(collection(db, 'plans'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan));
  },

  async createPlan(plan: Omit<Plan, 'id'>) {
    return await addDoc(collection(db, 'plans'), plan);
  },

  async updatePlan(id: string, data: Partial<Plan>) {
    const docRef = doc(db, 'plans', id);
    return await updateDoc(docRef, data);
  },

  // Subscriptions Management
  async getAllSubscriptions() {
    const snapshot = await getDocs(collection(db, 'subscriptions'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subscription));
  },

  async updateSubscription(id: string, data: Partial<Subscription>) {
    const docRef = doc(db, 'subscriptions', id);
    return await updateDoc(docRef, data);
  },

  // Users Management
  async getAllUsers() {
    // Usa a rota do servidor (Admin SDK) para listar todos os usuários
    // evitando restrições das regras do Firestore no client SDK
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Usuário não autenticado');
    const idToken = await currentUser.getIdToken();
    const response = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Falha ao listar usuários');
    }
    const data = await response.json();
    return (data.users || []) as UserProfile[];
  },

  async deleteUser(uid: string) {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Usuário não autenticado');

    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/admin/users/${uid}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Falha ao excluir usuário');
    }

    return response.json();
  },

  // Global Metrics
  async getGlobalMetrics() {
    const salons = await this.getAllSalons();
    const subscriptions = await this.getAllSubscriptions();
    const plans = await this.getAllPlans();
    
    const activeSalons = salons.filter(s => s.status === 'ACTIVE').length;
    const trialSalons = salons.filter(s => s.status === 'TRIAL').length;
    const expiredSalons = salons.filter(s => s.status === 'EXPIRED').length;
    
    const totalRevenue = subscriptions
      .filter(sub => sub.status === 'ACTIVE')
      .reduce((acc, sub) => {
        const plan = plans.find(p => p.id === sub.planId);
        return acc + (plan?.price || 0);
      }, 0);
    
    return {
      totalSalons: salons.length,
      activeSalons,
      trialSalons,
      expiredSalons,
      totalRevenue,
      pendingSalons: salons.filter(s => s.status === 'PENDING').length,
      avgRevenuePerSalon: activeSalons > 0 ? totalRevenue / activeSalons : 0
    };
  }
};
