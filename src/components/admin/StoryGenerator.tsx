import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Download, RefreshCw, Palette, Clock, Type, Eye,
  Image as ImageIcon, QrCode, ChevronDown, ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useSettings } from '../../contexts/SettingsContext';
import { useSalon } from '../../contexts/SalonContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { storeService } from '../../services/storeService';
import { Product } from '../../types';
import { usePlanAccess } from '../../hooks/usePlanAccess';
import { db } from '../../firebase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { QRCodeCanvas } from 'qrcode.react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const toMin = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const fromMin = (m: number) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

function buildAllSlots(open: string, close: string, interval: number, lunchStart?: string, lunchEnd?: string): string[] {
  const slots: string[] = [];
  const lS = lunchStart ? toMin(lunchStart) : null;
  const lE = lunchEnd   ? toMin(lunchEnd)   : null;
  let cur = toMin(open);
  const end = toMin(close);
  while (cur + interval <= end) {
    const isLunch = lS !== null && lE !== null && cur < lE && (cur + interval) > lS;
    if (!isLunch) slots.push(fromMin(cur));
    cur += interval;
  }
  return slots;
}

function getFreeSlots(allSlots: string[], bookedTimes: string[], marginMin = 30): string[] {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() + marginMin;
  return allSlots.filter(slot => {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m > nowMin && !bookedTimes.includes(slot);
  });
}

// Groups consecutive free slots into ranges: [{start:'09:00', end:'11:30'}, ...]
function groupIntoRanges(freeSlots: string[], interval: number): {start: string; end: string}[] {
  if (freeSlots.length === 0) return [];
  const ranges: {start: string; end: string}[] = [];
  let rangeStart = freeSlots[0];
  let prev = toMin(freeSlots[0]);
  for (let i = 1; i < freeSlots.length; i++) {
    const cur = toMin(freeSlots[i]);
    if (cur - prev > interval) {
      ranges.push({ start: rangeStart, end: fromMin(prev + interval) });
      rangeStart = freeSlots[i];
    }
    prev = cur;
  }
  ranges.push({ start: rangeStart, end: fromMin(prev + interval) });
  return ranges;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESET_MESSAGES = [
  'Horários disponíveis hoje ✨',
  'Ainda dá tempo de se cuidar hoje 💅',
  'Agenda aberta! Vem se cuidar 🌸',
  'Horários livres pra você hoje ✂️',
  'Se cuide hoje — temos horário! 💆',
  'Não perde esses horários! 🔥',
];

const BG_PRESETS = [
  { label: 'Preto', value: '#111111' },
  { label: 'Vinho', value: '#4a0e1c' },
  { label: 'Marinho', value: '#0f1e3c' },
  { label: 'Verde escuro', value: '#0d2818' },
  { label: 'Cinza', value: '#2a2a2a' },
  { label: 'Branco', value: '#f5f5f5' },
];

type DisplayMode = 'ranges' | 'count' | 'next';
type StoreMode = 'highlight' | 'promo' | 'new';
type GeneratorTab = 'agenda' | 'loja';

interface Config {
  bgColor: string;
  textColor: string;
  accentColor: string;
  boxColor: string;
  showLogo: boolean;
  showQR: boolean;
  message: string;
  displayMode: DisplayMode;
  customMessage: string;
  useCustomMessage: boolean;
  // Store mode
  storeMode: StoreMode;
  storeMessage: string;
}

interface Props { salonId: string; }

// ─── Component ────────────────────────────────────────────────────────────────
export const StoryGenerator: React.FC<Props> = ({ salonId }) => {
  const { settings } = useSettings();
  const { salon } = useSalon();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<GeneratorTab>('agenda');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productImg, setProductImg] = useState<HTMLImageElement | null>(null);
  const { hasFeature } = usePlanAccess();
  const hasStore = hasFeature('hasStore');

  const [freeSlots, setFreeSlots] = useState<string[]>([]);
  const [interval, setIntervalMin] = useState(30);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);

  const salonName = settings?.branding?.headerName || salon?.name || 'Meu Salão';
  const primaryColor = settings?.appearance?.primaryColor || '#e11d48';
  const salonUrl = `https://bella-chic.duckdns.org/s/${salon?.slug || ''}`;

  const [config, setConfig] = useState<Config>({
    bgColor: '#111111',
    textColor: '#ffffff',
    accentColor: primaryColor,
    boxColor: 'rgba(255,255,255,0.08)',
    storeMode: 'highlight' as StoreMode,
    storeMessage: '',
    showLogo: true,
    showQR: true,
    message: PRESET_MESSAGES[0],
    displayMode: 'ranges',
    customMessage: '',
    useCustomMessage: false,
  });

  const configRef = React.useRef(config);
  React.useEffect(() => { configRef.current = config; }, [config]);

  const patch = (p: Partial<Config>) => setConfig(c => {
    const next = { ...c, ...p };
    configRef.current = next;
    return next;
  });

  // Sync accent color when settings load
  useEffect(() => {
    if (primaryColor) patch({ accentColor: primaryColor });
  }, [primaryColor]);

  // Load today's appointments
  useEffect(() => {
    if (!salonId || !settings) return;
    const today = new Date();
    const dayKey = DAY_KEYS[today.getDay()];
    const dayConfig = settings.business?.workingHours?.[dayKey];
    if (!dayConfig || dayConfig.closed) { setLoading(false); return; }

    const iv = settings.business?.slotInterval || 30;
    setIntervalMin(iv);
    const dateStr = format(today, 'yyyy-MM-dd');

    getDocs(query(
      collection(db, `salons/${salonId}/appointments`),
      where('date', '==', dateStr),
      where('status', 'in', ['PENDING', 'CONFIRMED'])
    )).then(snap => {
      const booked = snap.docs.map(d => d.data().startTime as string);
      const all = buildAllSlots(dayConfig.open || '09:00', dayConfig.close || '18:00', iv, dayConfig.lunchStart, dayConfig.lunchEnd);
      setFreeSlots(getFreeSlots(all, booked));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [salonId, settings]);

  // Load products for store mode
  useEffect(() => {
    if (!salonId || !hasStore) return;
    storeService.getAllProductsAdmin(salonId).then(p => {
      setProducts(p.filter(prod => prod.active !== false));
    }).catch(() => {});
  }, [salonId, hasStore]);

  // Preload selected product image
  useEffect(() => {
    if (!selectedProduct?.images?.[0]) { setProductImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setProductImg(img);
    img.src = selectedProduct.images[0];
  }, [selectedProduct]);

  // Preload logo
  useEffect(() => {
    const logoURL = settings?.branding?.logoURL;
    if (!logoURL) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLogoImg(img);
    img.src = logoURL;
  }, [settings?.branding?.logoURL]);



  const draw = useCallback(async () => {
    const config = configRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGenerating(true);
    const ctx = canvas.getContext('2d')!;
    const W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;

    const isLight = config.bgColor === '#f5f5f5';
    const text = isLight ? '#111111' : '#ffffff';
    const muted = isLight ? '#555555' : 'rgba(255,255,255,0.6)';
    const accent = config.accentColor;

    // BG
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, W, H);

    // Subtle circles decoration
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(-80, 200, 500, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(W+80, H-200, 500, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // Top + bottom accent bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, 10);
    ctx.fillRect(0, H-10, W, 10);

    let y = 60;

    // Logo or salon name
    if (config.showLogo && logoImg) {
      const maxH = 120, maxW = 400;
      const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height);
      const lw = logoImg.width * ratio, lh = logoImg.height * ratio;
      ctx.drawImage(logoImg, (W - lw) / 2, y, lw, lh);
      y += lh + 30;
    } else {
      ctx.fillStyle = muted;
      ctx.font = `500 48px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(salonName.toUpperCase(), W/2, y + 50);
      y += 90;
    }

    // Thin divider
    ctx.fillStyle = accent;
    ctx.fillRect(W/2 - 60, y, 120, 3);
    y += 200;

    // Message
    const msg = config.useCustomMessage ? config.customMessage : config.message;
    ctx.fillStyle = text;
    ctx.font = `bold 82px sans-serif`;
    ctx.textAlign = 'center';
    const words = msg.split(' ');
    let line = '';
    const lineHeight = 100;
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > W - 120 && line) {
        ctx.fillText(line.trim(), W/2, y); y += lineHeight; line = word + ' ';
      } else line = test;
    }
    if (line.trim()) { ctx.fillText(line.trim(), W/2, y); y += lineHeight; }
    y += 20;

    // Date
    ctx.fillStyle = muted;
    ctx.font = `500 46px sans-serif`;
    ctx.fillText(format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR }), W/2, y);
    y += 80;

    // ── Display content ──────────────────────────────────────────────────────
    const ranges = groupIntoRanges(freeSlots, interval);

    if (freeSlots.length === 0) {
      // Full day indicator
      ctx.fillStyle = isLight ? '#e5e5e5' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(80, y, W-160, 120, 20); ctx.fill();
      ctx.fillStyle = muted;
      ctx.font = `500 50px sans-serif`;
      ctx.fillText('Agenda completa hoje 📋', W/2, y + 76);
      y += 160;

    } else if (config.displayMode === 'ranges') {
      // Time range blocks
      ctx.fillStyle = muted;
      ctx.font = `500 42px sans-serif`;
      ctx.fillText('Horários disponíveis:', W/2, y);
      y += 60;
      for (const range of ranges) {
        ctx.fillStyle = config.boxColor;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(100, y, W-200, 110, 18); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text;
        ctx.font = `bold 58px sans-serif`;
        ctx.fillText(`${range.start}  →  ${range.end}`, W/2, y + 73);
        y += 135;
      }

    } else if (config.displayMode === 'count') {
      // Count display
      ctx.fillStyle = config.boxColor;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(100, y, W-200, 260, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = `bold 140px sans-serif`;
      ctx.fillText(String(freeSlots.length), W/2, y + 175);
      ctx.fillStyle = text;
      ctx.font = `500 52px sans-serif`;
      ctx.fillText(freeSlots.length === 1 ? 'horário disponível hoje' : 'horários disponíveis hoje', W/2, y + 240);
      y += 300;
      // Next slot hint
      ctx.fillStyle = muted;
      ctx.font = `500 44px sans-serif`;
      ctx.fillText(`Próximo: ${freeSlots[0]}`, W/2, y + 20);
      y += 80;

    } else if (config.displayMode === 'next') {
      // Next slot only
      ctx.fillStyle = muted;
      ctx.font = `500 50px sans-serif`;
      ctx.fillText('Próximo horário disponível', W/2, y);
      y += 70;
      ctx.fillStyle = config.boxColor;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(100, y, W-200, 180, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = text;
      ctx.font = `bold 110px sans-serif`;
      ctx.fillText(freeSlots[0], W/2, y + 128);
      y += 220;
      if (freeSlots.length > 1) {
        ctx.fillStyle = muted;
        ctx.font = `500 40px sans-serif`;
        ctx.fillText(`+ mais ${freeSlots.length - 1} horários no dia`, W/2, y);
        y += 60;
      }
    }

    y += 40;

    // ── QR Code + Link ───────────────────────────────────────────────────────
    const bottomArea = H - 80;
    const qrSection = config.showQR ? 380 : 180;
    const qrY = Math.max(y + 20, bottomArea - qrSection);

    // CTA box
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(60, qrY, W-120, config.showQR ? 360 : 160, 24);
    ctx.fill(); ctx.stroke();

    if (config.showQR && qrCanvasRef.current) {
      const qrSize = 200;
      ctx.drawImage(qrCanvasRef.current, W/2 - qrSize/2, qrY + 20, qrSize, qrSize);
      ctx.fillStyle = text;
      ctx.font = `bold 44px sans-serif`;
      ctx.fillText('Aponte a câmera para agendar', W/2, qrY + 250);
      ctx.fillStyle = muted;
      ctx.font = `38px sans-serif`;
      ctx.fillText(salonUrl.replace('https://', ''), W/2, qrY + 310);
    } else {
      ctx.fillStyle = text;
      ctx.font = `bold 50px sans-serif`;
      ctx.fillText('Agende pelo link:', W/2, qrY + 70);
      ctx.fillStyle = accent;
      ctx.font = `500 42px sans-serif`;
      ctx.fillText(salonUrl.replace('https://', ''), W/2, qrY + 130);
    }

    setGenerating(false);
  }, [freeSlots, interval, logoImg, salonName, salonUrl]);

  // ─── Draw Store Story ────────────────────────────────────────────────────────
  const drawStore = useCallback(async () => {
    const config = configRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !selectedProduct) return;
    setGenerating(true);

    const ctx = canvas.getContext('2d')!;
    const W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;

    const isLight = config.bgColor === '#f5f5f5';
    const text = isLight ? '#111111' : '#ffffff';
    const muted = isLight ? '#555555' : 'rgba(255,255,255,0.6)';
    const accent = config.accentColor;

    // BG
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(-80, 300, 500, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(W+80, H-300, 500, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // Top + bottom bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, 10);
    ctx.fillRect(0, H-10, W, 10);

    let y = 60;

    // Logo or store name
    if (config.showLogo && logoImg) {
      const maxH = 110, maxW = 350;
      const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height);
      const lw = logoImg.width * ratio, lh = logoImg.height * ratio;
      ctx.drawImage(logoImg, (W - lw) / 2, y, lw, lh);
      y += lh + 24;
    } else {
      ctx.fillStyle = muted;
      ctx.font = '500 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(salonName.toUpperCase(), W/2, y + 44);
      y += 80;
    }

    // Mode badge
    const badgeText = config.storeMode === 'highlight' ? '⭐ DESTAQUE' :
                      config.storeMode === 'promo'     ? '🔥 PROMOÇÃO' : '✨ NOVIDADE';
    const badgeW = ctx.measureText(badgeText).width + 60;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect((W - badgeW) / 2, y, badgeW, 64, 32);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(badgeText, W/2, y + 44);
    y += 90;

    // Product image
    const imgAreaH = 820;
    if (productImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(60, y, W-120, imgAreaH, 32);
      ctx.clip();
      // Cover fit
      const scale = Math.max((W-120) / productImg.width, imgAreaH / productImg.height);
      const sw = productImg.width * scale;
      const sh = productImg.height * scale;
      ctx.drawImage(productImg, 60 + ((W-120) - sw)/2, y + (imgAreaH - sh)/2, sw, sh);
      ctx.restore();
      // Gradient overlay at bottom of image
      const grad = ctx.createLinearGradient(0, y + imgAreaH - 200, 0, y + imgAreaH);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(60, y, W-120, imgAreaH, 32); ctx.fill();
    } else {
      ctx.fillStyle = isLight ? '#e5e5e5' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(60, y, W-120, imgAreaH, 32); ctx.fill();
      ctx.fillStyle = muted;
      ctx.font = '48px sans-serif';
      ctx.fillText('📦 Sem imagem', W/2, y + imgAreaH/2);
    }
    y += imgAreaH + 40;

    // Product name
    ctx.fillStyle = text;
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    // Word wrap
    const words = selectedProduct.name.split(' ');
    let line = '';
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > W - 120 && line) {
        ctx.fillText(line.trim(), W/2, y); y += 86; line = word + ' ';
      } else line = test;
    }
    if (line.trim()) { ctx.fillText(line.trim(), W/2, y); y += 86; }

    // Price
    if (config.storeMode === 'promo' && selectedProduct.promotionalPrice) {
      ctx.fillStyle = muted;
      ctx.font = '500 52px sans-serif';
      // Strikethrough original price
      const origText = `R$ ${(selectedProduct.price ?? 0).toFixed(2)}`;
      const origW = ctx.measureText(origText).width;
      ctx.fillText(origText, W/2, y);
      ctx.strokeStyle = muted;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W/2 - origW/2, y - 18);
      ctx.lineTo(W/2 + origW/2, y - 18);
      ctx.stroke();
      y += 70;
      ctx.fillStyle = accent;
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText(`R$ ${selectedProduct.promotionalPrice.toFixed(2)}`, W/2, y);
      y += 100;
    } else {
      ctx.fillStyle = accent;
      ctx.font = 'bold 96px sans-serif';
      ctx.fillText(`R$ ${(selectedProduct.price ?? 0).toFixed(2)}`, W/2, y);
      y += 110;
    }

    // Custom message
    const msg = config.storeMessage || (
      config.storeMode === 'highlight' ? 'Aproveite! Peça pelo link 👇' :
      config.storeMode === 'promo'     ? 'Oferta por tempo limitado! 🔥' :
      'Chegou novidade! Não perca 🛍️'
    );
    ctx.fillStyle = text;
    ctx.font = '500 54px sans-serif';
    ctx.fillText(msg, W/2, y);
    y += 80;

    // QR code
    if (config.showQR && qrCanvasRef.current) {
      const qrSize = 180;
      const qrY = Math.max(y + 20, H - 280);
      ctx.fillStyle = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(60, qrY, W-120, 230, 24); ctx.fill(); ctx.stroke();
      ctx.drawImage(qrCanvasRef.current, W/2 - qrSize/2, qrY + 20, qrSize, qrSize);
      ctx.fillStyle = text;
      ctx.font = 'bold 38px sans-serif';
      ctx.fillText('Aponte a câmera para pedir', W/2, qrY + 218);
    }

    setGenerating(false);
  }, [selectedProduct, productImg, logoImg, qrCanvasRef, salonName]);

  useEffect(() => {
    if (!loading) {
      // Small delay to ensure QRCodeCanvas has rendered
      const t = setTimeout(draw, 100);
      return () => clearTimeout(t);
    }
  }, [loading, draw]);

  useEffect(() => {
    if (activeTab === 'loja' && selectedProduct) {
      const t = setTimeout(drawStore, 150);
      return () => clearTimeout(t);
    }
  }, [activeTab, selectedProduct, drawStore]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const suffix = activeTab === 'loja' ? (selectedProduct?.name?.slice(0,20).replace(/\s/g,'-') || 'produto') : 'story';
    link.download = `${suffix}-${format(new Date(), 'dd-MM-yyyy')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const displayModes: { id: DisplayMode; label: string; desc: string }[] = [
    { id: 'ranges', label: 'Faixas de horário', desc: '09:00 → 11:30 | 14:00 → 17:00' },
    { id: 'count',  label: 'Quantidade de vagas', desc: '"5 horários disponíveis hoje"' },
    { id: 'next',   label: 'Próximo horário',  desc: '"Próximo: 14h30 + mais 3 no dia"' },
  ];

  const STORE_MODES = [
    { id: 'highlight' as StoreMode, label: '⭐ Destaque', desc: 'Produto em destaque' },
    { id: 'promo'     as StoreMode, label: '🔥 Promoção', desc: 'Preço promocional' },
    { id: 'new'       as StoreMode, label: '✨ Novidade', desc: 'Produto novo' },
  ];

  return (
    <div className="space-y-5">

      {/* Tab switcher - show only if hasStore */}
      {hasStore && (
        <div className="flex rounded-xl border p-1 gap-1">
          {([
            { id: 'agenda' as GeneratorTab, label: '📅 Agenda' },
            { id: 'loja'   as GeneratorTab, label: '🛍️ Loja' },
          ]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${activeTab === t.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── STORE MODE ── */}
      {activeTab === 'loja' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: controls */}
          <div className="space-y-5">

            {/* Product selector */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Selecione o produto</p>
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
              ) : (
                <div className="grid gap-2 max-h-64 overflow-y-auto pr-1">
                  {products.map(p => (
                    <button key={p.id}
                      onClick={() => { setSelectedProduct(p); setTimeout(drawStore, 150); }}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${selectedProduct?.id === p.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0 text-xl">📦</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <div className="flex items-center gap-2">
                          {p.promotionalPrice ? (
                            <>
                              <span className="text-xs line-through text-muted-foreground">R$ {(p.price ?? 0).toFixed(2)}</span>
                              <span className="text-xs font-bold text-primary">R$ {p.promotionalPrice.toFixed(2)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">R$ {(p.price ?? 0).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      {selectedProduct?.id === p.id && <span className="text-primary text-lg">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Store mode */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Tipo de story</p>
              {STORE_MODES.map(m => (
                <button key={m.id}
                  onClick={() => { patch({ storeMode: m.id }); setTimeout(drawStore, 50); }}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${config.storeMode === m.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                  <p className={`font-medium text-sm ${config.storeMode === m.id ? 'text-primary' : ''}`}>{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </button>
              ))}
            </div>

            {/* Custom message */}
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Mensagem (opcional)</p>
              <textarea
                rows={2}
                placeholder={config.storeMode === 'highlight' ? 'Aproveite! Peça pelo link 👇' : config.storeMode === 'promo' ? 'Oferta por tempo limitado! 🔥' : 'Chegou novidade! Não perca 🛍️'}
                value={config.storeMessage}
                onChange={e => { patch({ storeMessage: e.target.value }); setTimeout(drawStore, 100); }}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            {/* Appearance */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Aparência</p>
              <div className="flex flex-wrap gap-2">
                {BG_PRESETS.map(p => (
                  <button key={p.value}
                    onClick={() => { patch({ bgColor: p.value, textColor: p.value === '#f5f5f5' ? '#111111' : '#ffffff' }); setTimeout(drawStore, 50); }}
                    title={p.label}
                    className={`h-9 w-9 rounded-full border-2 transition-all ${config.bgColor === p.value ? 'border-primary scale-110' : 'border-transparent'}`}
                    style={{ background: p.value }} />
                ))}
                <input type="color" value={config.bgColor}
                  onChange={e => { patch({ bgColor: e.target.value }); setTimeout(drawStore, 50); }}
                  className="h-9 w-9 rounded-full border-2 border-border cursor-pointer" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground">Cor destaque:</label>
                <input type="color" value={config.accentColor}
                  onChange={e => { patch({ accentColor: e.target.value }); setTimeout(drawStore, 50); }}
                  className="h-8 w-8 rounded-full border-2 border-border cursor-pointer" />
                <button onClick={() => { patch({ accentColor: primaryColor }); setTimeout(drawStore, 50); }}
                  className="text-xs text-primary underline">Cor do salão</button>
              </div>
              {/* Toggles */}
              {[
                { key: 'showLogo' as const, label: 'Mostrar logo' },
                { key: 'showQR'  as const, label: 'QR Code' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <button
                    onClick={() => { patch({ [key]: !config[key] }); setTimeout(drawStore, 100); }}
                    className={`relative h-6 w-11 rounded-full transition-colors ${config[key] ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${config[key] ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: preview */}
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Preview</p>
              <Button size="sm" variant="outline" onClick={drawStore} disabled={generating || !selectedProduct}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
            {!selectedProduct && (
              <div className="flex items-center justify-center h-40 rounded-xl border border-dashed text-muted-foreground text-sm">
                Selecione um produto para ver o preview
              </div>
            )}
            <canvas ref={canvasRef}
              style={{ width: '100%', maxWidth: 300, height: 'auto', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', display: selectedProduct ? 'block' : 'none' }}
            />
            <Button className="w-full" size="lg" onClick={handleDownload} disabled={generating || !selectedProduct}>
              <Download className="mr-2 h-5 w-5" />
              Baixar story do produto
            </Button>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">💡 Como usar:</p>
              <p>📸 <strong>Instagram:</strong> Poste como story e adicione o adesivo de link 🔗</p>
              <p>💬 <strong>WhatsApp:</strong> Cole o link do seu produto na legenda do status</p>
            </div>
          </div>
        </div>
      )}

      {/* ── AGENDA MODE ── */}
      {activeTab === 'agenda' && (
        <>
      {/* Availability summary */}
      {!loading && (
        <div className={`rounded-xl border p-4 text-sm flex items-center gap-3 ${freeSlots.length > 0 ? 'bg-green-50 border-green-200' : 'bg-muted/40'}`}>
          <Clock className={`h-5 w-5 shrink-0 ${freeSlots.length > 0 ? 'text-green-600' : 'text-muted-foreground'}`} />
          {freeSlots.length > 0
            ? <span><strong className="text-green-700">{freeSlots.length} horários livres</strong> hoje — {groupIntoRanges(freeSlots, interval).length} faixa(s) de disponibilidade.</span>
            : <span className="text-muted-foreground">Sem horários disponíveis hoje. O story vai mostrar que a agenda está completa.</span>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">

        {/* ── LEFT: Controls ── */}
        <div className="space-y-5">

          {/* Display mode */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Como mostrar os horários</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {displayModes.map(m => (
                <button key={m.id}
                  onClick={() => { patch({ displayMode: m.id }); setTimeout(draw, 50); }}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${config.displayMode === m.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                  <p className={`font-medium text-sm ${config.displayMode === m.id ? 'text-primary' : ''}`}>{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Message */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Type className="h-4 w-4" /> Mensagem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-1.5">
                {PRESET_MESSAGES.map((m, i) => (
                  <button key={i}
                    onClick={() => { patch({ message: m, useCustomMessage: false }); setTimeout(draw, 50); }}
                    className={`rounded-lg border px-3 py-2 text-sm text-left transition-all ${!config.useCustomMessage && config.message === m ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                    {m}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ou escreva sua própria mensagem:</Label>
                <Textarea
                  placeholder="Ex: Vagas especiais essa semana ✨"
                  rows={2}
                  value={config.customMessage}
                  onChange={e => { patch({ customMessage: e.target.value, useCustomMessage: true }); setTimeout(draw, 100); }}
                  className={config.useCustomMessage ? 'border-primary' : ''}
                />
                {config.customMessage && (
                  <p className="text-xs text-muted-foreground">
                    {config.useCustomMessage ? '✅ Usando mensagem personalizada' : ''}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Customization */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> Aparência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Background */}
              <div className="space-y-2">
                <Label className="text-sm">Cor de fundo</Label>
                <div className="flex flex-wrap gap-2">
                  {BG_PRESETS.map(p => (
                    <button key={p.value}
                      onClick={() => { patch({ bgColor: p.value, textColor: p.value === '#f5f5f5' ? '#111111' : '#ffffff' }); setTimeout(draw, 50); }}
                      title={p.label}
                      className={`h-9 w-9 rounded-full border-2 transition-all ${config.bgColor === p.value ? 'border-primary scale-110' : 'border-transparent'}`}
                      style={{ background: p.value }} />
                  ))}
                  <div className="flex items-center gap-1">
                    <input type="color" value={config.bgColor}
                      onChange={e => { patch({ bgColor: e.target.value }); setTimeout(draw, 50); }}
                      className="h-9 w-9 rounded-full border-2 border-border cursor-pointer" />
                    <span className="text-xs text-muted-foreground">Custom</span>
                  </div>
                </div>
              </div>

              {/* Accent color */}
              <div className="space-y-2">
                <Label className="text-sm">Cor de destaque (barras e bordas)</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={config.accentColor}
                    onChange={e => { patch({ accentColor: e.target.value }); setTimeout(draw, 50); }}
                    className="h-9 w-9 rounded-full border-2 border-border cursor-pointer" />
                  <span className="text-sm text-muted-foreground">{config.accentColor}</span>
                  <button onClick={() => {
                      patch({ accentColor: primaryColor });
                      setTimeout(draw, 50);
                    }}
                    className="text-xs text-primary underline">
                    Usar cor do salão
                  </button>
                </div>
              </div>

              {/* Text color */}
              <div className="space-y-2">
                <Label className="text-sm">Cor do texto</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={config.textColor}
                    onChange={e => { patch({ textColor: e.target.value }); setTimeout(draw, 50); }}
                    className="h-9 w-9 rounded-full border-2 border-border cursor-pointer" />
                  <span className="text-sm text-muted-foreground">{config.textColor}</span>
                  <div className="flex gap-2">
                    <button onClick={() => { patch({ textColor: '#ffffff' }); setTimeout(draw, 50); }}
                      className="text-xs underline text-muted-foreground">Branco</button>
                    <button onClick={() => { patch({ textColor: '#111111' }); setTimeout(draw, 50); }}
                      className="text-xs underline text-muted-foreground">Preto</button>
                  </div>
                </div>
              </div>

              {/* Box color */}
              <div className="space-y-2">
                <Label className="text-sm">Cor dos quadros de horário</Label>
                <div className="flex flex-wrap gap-2 items-center">
                  {[
                    { label: 'Transparente escuro', value: 'rgba(255,255,255,0.08)' },
                    { label: 'Transparente claro', value: 'rgba(0,0,0,0.08)' },
                    { label: 'Branco', value: '#ffffff' },
                    { label: 'Preto', value: '#000000' },
                  ].map(p => (
                    <button key={p.value}
                      onClick={() => { patch({ boxColor: p.value }); setTimeout(draw, 50); }}
                      title={p.label}
                      className={`rounded-lg border px-2 py-1 text-xs transition-all ${config.boxColor === p.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                      {p.label}
                    </button>
                  ))}
                  <input type="color"
                    value={config.boxColor.startsWith('rgba') ? '#1a1a1a' : config.boxColor}
                    onChange={e => { patch({ boxColor: e.target.value }); setTimeout(draw, 50); }}
                    className="h-8 w-8 rounded-lg border-2 border-border cursor-pointer" />
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                {[
                  { key: 'showLogo' as const, label: 'Mostrar logo do salão', sub: settings?.branding?.logoURL ? '' : '(sem logo configurada)' },
                  { key: 'showQR'  as const, label: 'QR Code para agendamento', sub: 'Clientes escaneiam direto da tela' },
                ].map(({ key, label, sub }) => (
                  <div key={key} className="flex items-center justify-between rounded-xl border p-3">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                    </div>
                    <button
                      onClick={() => { patch({ [key]: !config[key] }); setTimeout(draw, 100); }}
                      className={`relative h-6 w-11 rounded-full transition-colors ${config[key] ? 'bg-primary' : 'bg-muted'}`}>
                      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${config[key] ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Preview ── */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-1.5"><Eye className="h-4 w-4" /> Preview</p>
            <Button size="sm" variant="outline" onClick={draw} disabled={generating}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {/* Hidden QR canvas used to draw into the story image */}
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
            <QRCodeCanvas
              ref={qrCanvasRef}
              value={salonUrl}
              size={200}
              bgColor="transparent"
              fgColor={config.bgColor === '#f5f5f5' ? '#111111' : '#ffffff'}
            />
          </div>

          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                maxWidth: 300,
                height: 'auto',
                borderRadius: 16,
                border: '1px solid var(--border)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.1)'
              }}
            />
          </div>

          <Button className="w-full" size="lg" onClick={handleDownload} disabled={generating || loading}>
            <Download className="mr-2 h-5 w-5" />
            Baixar story (1080×1920px)
          </Button>

          {/* How to post guide */}
          <div className="space-y-3">
            <p className="text-sm font-medium">📲 Como postar após baixar</p>

            {/* Instagram */}
            <div className="rounded-xl border border-pink-200 bg-pink-50 overflow-hidden">
              <div className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2.5">
                <span className="text-white text-base">📸</span>
                <span className="text-white font-semibold text-sm">Instagram Story</span>
              </div>
              <div className="p-4 space-y-2">
                {[
                  'Abra o Instagram e toque no "+" para criar um story',
                  'Selecione a imagem que você baixou',
                  'Toque no ícone de adesivo 🔗 no topo',
                  'Escolha "Link" e cole o link do seu salão',
                  'O botão "Visitar" aparece no story automaticamente!',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-pink-900">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pink-200 text-[11px] font-bold text-pink-700 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
                <div className="mt-3 rounded-lg bg-pink-100 px-3 py-2 text-xs text-pink-700">
                  💡 Qualquer conta já tem acesso ao adesivo de link — não precisa de 10 mil seguidores mais!
                </div>
              </div>
            </div>

            {/* WhatsApp */}
            <div className="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
              <div className="flex items-center gap-2 bg-green-500 px-4 py-2.5">
                <span className="text-white text-base">💬</span>
                <span className="text-white font-semibold text-sm">WhatsApp Status</span>
              </div>
              <div className="p-4 space-y-2">
                {[
                  'Abra o WhatsApp e vá em "Atualizações"',
                  'Toque no ícone de câmera ou "+" para criar status',
                  'Selecione a imagem que você baixou',
                  'No campo de legenda, cole o link do seu salão',
                  'Publique — seus contatos veem a imagem e o link!',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-green-900">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-200 text-[11px] font-bold text-green-700 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
                <div className="mt-3 rounded-lg bg-green-100 px-3 py-2 text-xs text-green-700">
                  💡 No WhatsApp não tem link clicável na imagem — o QR Code e a legenda são as melhores opções!
                </div>
              </div>
            </div>

            {/* Link to copy */}
            <div className="rounded-xl border bg-muted/40 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Seu link para copiar:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-background border px-3 py-2 text-xs font-mono truncate">
                  {salonUrl}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(salonUrl); }}
                  className="shrink-0 rounded-lg border px-3 py-2 text-xs hover:bg-muted transition-colors"
                >
                  Copiar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
