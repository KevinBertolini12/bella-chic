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
import { Product, Order, OrderStatus } from '../types';

// Remove campos undefined recursivamente — Firestore não aceita undefined
function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

export const storeService = {
  // Products - vitrine pública
  async getProducts(salonId: string) {
    const q = query(
      collection(db, `salons/${salonId}/products`),
      where('active', '==', true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  },

  // Products - painel admin
  async getAllProductsAdmin(salonId: string) {
    const q = query(
      collection(db, `salons/${salonId}/products`),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  },

  async getProductById(salonId: string, id: string) {
    const docRef = doc(db, `salons/${salonId}/products`, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null;
  },

  async addProduct(salonId: string, product: Omit<Product, 'id' | 'salonId'>) {
    const data = removeUndefined({
      ...product,
      salonId,
      createdAt: product.createdAt || Date.now(),
    });
    return await addDoc(collection(db, `salons/${salonId}/products`), data);
  },

  async updateProduct(salonId: string, id: string, product: Partial<Product>) {
    const docRef = doc(db, `salons/${salonId}/products`, id);
    return await updateDoc(docRef, removeUndefined(product));
  },

  async deleteProduct(salonId: string, id: string) {
    const docRef = doc(db, `salons/${salonId}/products`, id);
    return await deleteDoc(docRef);
  },

  // Orders
  async createOrder(salonId: string, order: Omit<Order, 'id' | 'salonId'>) {
    const data = removeUndefined({ ...order, salonId });
    return await addDoc(collection(db, `salons/${salonId}/orders`), data);
  },

  async getOrdersByClient(salonId: string, clientId: string) {
    const q = query(
      collection(db, `salons/${salonId}/orders`),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  },

  async getOrdersAdmin(salonId: string) {
    const q = query(
      collection(db, `salons/${salonId}/orders`),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  },

  async updateOrderStatus(salonId: string, id: string, status: OrderStatus) {
    // Se cancelando, passa pelo server para restaurar estoque
    if (status === 'CANCELLED') {
      try {
        const { auth } = await import('../firebase');
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/order/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ salonId, orderId: id }),
        });
        return;
      } catch (e) {
        console.error('[cancel order]', e);
      }
    }
    const docRef = doc(db, `salons/${salonId}/orders`, id);
    return await updateDoc(docRef, { status, updatedAt: Date.now() });
  }
};