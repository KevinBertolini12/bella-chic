import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface Coupon {
  id: string;
  salonId: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number; // percentage (0-100) or amount
  minOrderValue?: number;
  maxDiscount?: number;
  expiresAt?: number; // timestamp
  usageLimit?: number;
  usedCount: number;
  active: boolean;
  createdAt: number;
}

export const couponService = {
  async getCoupons(salonId: string): Promise<Coupon[]> {
    const q = query(collection(db, `salons/${salonId}/coupons`));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon));
  },
  
  async createCoupon(salonId: string, coupon: Omit<Coupon, 'id' | 'salonId' | 'usedCount' | 'createdAt'>): Promise<string> {
    const data = {
      ...coupon,
      salonId,
      usedCount: 0,
      createdAt: Date.now(),
    };
    const docRef = await addDoc(collection(db, `salons/${salonId}/coupons`), data);
    return docRef.id;
  },
  
  async updateCoupon(salonId: string, couponId: string, data: Partial<Coupon>): Promise<void> {
    const docRef = doc(db, `salons/${salonId}/coupons`, couponId);
    await updateDoc(docRef, data);
  },
  
  async deleteCoupon(salonId: string, couponId: string): Promise<void> {
    const docRef = doc(db, `salons/${salonId}/coupons`, couponId);
    await deleteDoc(docRef);
  },
  
  async validateCoupon(salonId: string, code: string, orderTotal: number): Promise<Coupon | null> {
    const q = query(
      collection(db, `salons/${salonId}/coupons`),
      where('code', '==', code.toUpperCase()),
      where('active', '==', true)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const coupon = snapshot.docs[0].data() as Coupon;
    coupon.id = snapshot.docs[0].id;
    
    // Validações
    if (coupon.expiresAt && coupon.expiresAt < Date.now()) return null;
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return null;
    if (coupon.minOrderValue && orderTotal < coupon.minOrderValue) return null;
    
    return coupon;
  },
  
  async useCoupon(salonId: string, couponId: string): Promise<void> {
    const couponRef = doc(db, `salons/${salonId}/coupons`, couponId);
    const couponSnap = await getDoc(couponRef);
    if (couponSnap.exists()) {
      const usedCount = couponSnap.data().usedCount || 0;
      await updateDoc(couponRef, { usedCount: usedCount + 1 });
    }
  },
  
  calculateDiscount(coupon: Coupon, subtotal: number): number {
    if (coupon.type === 'percentage') {
      let discount = (subtotal * coupon.value) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
      return discount;
    } else {
      return Math.min(coupon.value, subtotal);
    }
  }
};