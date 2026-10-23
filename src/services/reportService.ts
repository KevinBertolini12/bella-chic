import { db } from '../firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { format, getMonth, getYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MonthlyAppointment {
  month: string;
  count: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export interface TopProduct {
  id: string;
  name: string;
  totalSold: number;
  revenue: number;
}

const MONTH_LABELS = (year: number) =>
  Array.from({ length: 12 }, (_, i) =>
    format(new Date(year, i, 1), 'MMM', { locale: ptBR })
  );

export const reportService = {
  /**
   * Busca todos os agendamentos do ano em UMA query e agrupa por mês no cliente.
   * Antes: 12 queries sequenciais. Agora: 1 query.
   */
  async getMonthlyAppointments(salonId: string, year?: number): Promise<MonthlyAppointment[]> {
    const currentYear = year || new Date().getFullYear();
    const startStr = `${currentYear}-01-01`;
    const endStr   = `${currentYear}-12-31`;

    const q = query(
      collection(db, `salons/${salonId}/appointments`),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );
    const snapshot = await getDocs(q);

    const counts = Array(12).fill(0);
    snapshot.forEach(doc => {
      const date = doc.data().date as string; // 'yyyy-MM-dd'
      if (date) {
        const month = parseInt(date.split('-')[1], 10) - 1; // 0-indexed
        if (month >= 0 && month < 12) counts[month]++;
      }
    });

    return MONTH_LABELS(currentYear).map((month, i) => ({ month, count: counts[i] }));
  },

  /**
   * Busca todos os pedidos pagos do ano em UMA query e agrupa por mês no cliente.
   * Antes: 12 queries sequenciais. Agora: 1 query.
   */
  async getMonthlyRevenue(salonId: string, year?: number): Promise<MonthlyRevenue[]> {
    const currentYear = year || new Date().getFullYear();
    const startTime = new Date(currentYear, 0, 1).getTime();
    const endTime   = new Date(currentYear, 11, 31, 23, 59, 59).getTime();

    const q = query(
      collection(db, `salons/${salonId}/orders`),
      where('status', 'in', ['PAID', 'COMPLETED']),
      where('paidAt', '>=', startTime),
      where('paidAt', '<=', endTime)
    );
    const snapshot = await getDocs(q);

    const revenue = Array(12).fill(0);
    snapshot.forEach(doc => {
      const paidAt = doc.data().paidAt as number;
      if (paidAt) {
        const month = getMonth(new Date(paidAt));
        revenue[month] += doc.data().totalAmount || 0;
      }
    });

    return MONTH_LABELS(currentYear).map((month, i) => ({ month, revenue: revenue[i] }));
  },

  async getTopProducts(salonId: string, limit = 5): Promise<TopProduct[]> {
    const q = query(
      collection(db, `salons/${salonId}/orders`),
      where('status', 'in', ['PAID', 'COMPLETED'])
    );
    const snapshot = await getDocs(q);

    const productMap = new Map<string, { name: string; totalSold: number; revenue: number }>();

    snapshot.forEach(doc => {
      const order = doc.data();
      order.items?.forEach((item: any) => {
        const existing = productMap.get(item.productId);
        if (existing) {
          existing.totalSold += item.quantity;
          existing.revenue   += item.price * item.quantity;
        } else {
          productMap.set(item.productId, {
            name:      item.name,
            totalSold: item.quantity,
            revenue:   item.price * item.quantity,
          });
        }
      });
    });

    return Array.from(productMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, limit);
  },
};
