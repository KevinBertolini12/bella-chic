import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, Reply, ThumbsUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db } from '../../firebase';
import {
  collection, addDoc, query, where, getDocs, orderBy,
  doc, updateDoc, onSnapshot, getDoc,
} from 'firebase/firestore';
import { Review } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

// ─── Star Rating input ────────────────────────────────────────────────────────
export const StarRating: React.FC<{
  value: number;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
}> = ({ value, onChange, size = 'md', readonly = false }) => {
  const [hover, setHover] = useState(0);
  const sz = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={cn('transition-colors', readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110')}
        >
          <Star
            className={cn(sz, 'transition-colors', (hover || value) >= star ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')}
          />
        </button>
      ))}
    </div>
  );
};

// ─── Rating summary bar ───────────────────────────────────────────────────────
export const RatingSummary: React.FC<{ reviews: Review[] }> = ({ reviews }) => {
  if (reviews.length === 0) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const counts = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
  }));

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center p-4 sm:p-6 bg-muted/30 rounded-xl">
      <div className="text-center shrink-0">
        <div className="text-4xl sm:text-5xl font-bold text-primary">{(avg ?? 0).toFixed(1)}</div>
        <StarRating value={Math.round(avg)} readonly size="sm" />
        <div className="text-xs text-muted-foreground mt-1">{reviews.length} avaliações</div>
      </div>
      <div className="flex-1 w-full space-y-1">
        {counts.map(({ star, count }) => (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-4 text-right text-muted-foreground">{star}</span>
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%' }}
              />
            </div>
            <span className="w-5 text-muted-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Leave a review (client side) ────────────────────────────────────────────
export const LeaveReview: React.FC<{
  salonId: string;
  appointmentId?: string;
  professionalId?: string;
  professionalName?: string;
  serviceId?: string;
  serviceName?: string;
  onSuccess?: () => void;
}> = ({ salonId, appointmentId, professionalId, professionalName, serviceId, serviceName, onSuccess }) => {
  const { user, profile } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Check if already reviewed
  useEffect(() => {
    if (!user || !appointmentId) return;
    getDocs(query(
      collection(db, `salons/${salonId}/reviews`),
      where('appointmentId', '==', appointmentId),
      where('clientId', '==', user.uid)
    )).then(snap => { if (!snap.empty) setSubmitted(true); });
  }, [user, salonId, appointmentId]);

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 text-center">
        ✅ Avaliação enviada! Obrigado pelo feedback.
      </div>
    );
  }

  const handleSubmit = async () => {
    if (rating === 0) { toast.error('Escolha uma nota de 1 a 5 estrelas.'); return; }
    if (!user) { toast.error('Faça login para avaliar.'); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/reviews`), {
        salonId,
        clientId: user.uid,
        clientName: profile?.displayName || user.displayName || 'Cliente',
        professionalId,
        professionalName,
        serviceId,
        serviceName,
        appointmentId,
        rating,
        comment: comment.trim() || null,
        createdAt: Date.now(),
      } as Omit<Review, 'id'>);
      setSubmitted(true);
      toast.success('Avaliação enviada! Obrigado 🌟');
      onSuccess?.();
    } catch {
      toast.error('Erro ao enviar avaliação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          Avaliar atendimento
        </CardTitle>
        {serviceName && (
          <CardDescription>{serviceName} {professionalName && `com ${professionalName}`}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Sua nota:</p>
          <StarRating value={rating} onChange={setRating} size="lg" />
          <p className="text-xs text-muted-foreground">
            {rating === 1 ? 'Muito ruim' : rating === 2 ? 'Ruim' : rating === 3 ? 'Regular' : rating === 4 ? 'Bom' : rating === 5 ? 'Excelente! 🌟' : 'Toque nas estrelas'}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Comentário (opcional):</p>
          <Textarea
            placeholder="Conte como foi sua experiência..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
          />
        </div>
        <Button className="w-full" onClick={handleSubmit} disabled={loading || rating === 0}>
          {loading ? 'Enviando...' : 'Enviar avaliação'}
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── Reviews list (public + admin) ───────────────────────────────────────────
export const ReviewsList: React.FC<{
  salonId: string;
  isAdmin?: boolean;
  professionalId?: string;
  limit?: number;
}> = ({ salonId, isAdmin = false, professionalId, limit = 20 }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!salonId) return;
    let q = query(
      collection(db, `salons/${salonId}/reviews`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
      if (professionalId) list = list.filter(r => r.professionalId === professionalId);
      setReviews(list.slice(0, limit));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [salonId, professionalId]);

  const handleReply = async (reviewId: string) => {
    const reply = replyText[reviewId]?.trim();
    if (!reply) return;
    try {
      await updateDoc(doc(db, `salons/${salonId}/reviews`, reviewId), {
        reply,
        repliedAt: Date.now(),
      });
      setReplyText(p => ({ ...p, [reviewId]: '' }));
      setReplyingId(null);
      toast.success('Resposta publicada!');
    } catch {
      toast.error('Erro ao responder.');
    }
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground">Carregando avaliações...</div>;
  if (reviews.length === 0) return (
    <div className="py-10 text-center text-muted-foreground">
      <Star className="mx-auto h-10 w-10 opacity-20 mb-2" />
      <p>Nenhuma avaliação ainda.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <RatingSummary reviews={reviews} />
      {reviews.map(review => (
        <Card key={review.id} className="overflow-hidden">
          <CardContent className="pt-4 space-y-3">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{review.clientName}</p>
                {review.serviceName && (
                  <p className="text-xs text-muted-foreground">{review.serviceName}{review.professionalName && ` · ${review.professionalName}`}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <StarRating value={review.rating} readonly size="sm" />
                <span className="text-xs text-muted-foreground">
                  {format(new Date(review.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>
            </div>

            {/* Comment */}
            {review.comment && (
              <p className="text-sm text-muted-foreground">{review.comment}</p>
            )}

            {/* Reply */}
            {review.reply && (
              <div className="rounded-lg bg-muted/50 border-l-4 border-primary/40 p-3 text-sm">
                <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                  <Reply className="h-3 w-3" /> Resposta do salão
                </p>
                <p className="text-muted-foreground">{review.reply}</p>
              </div>
            )}

            {/* Admin reply button */}
            {isAdmin && !review.reply && (
              <div className="space-y-2">
                {replyingId === review.id ? (
                  <>
                    <Textarea
                      placeholder="Escreva sua resposta..."
                      rows={2}
                      value={replyText[review.id] || ''}
                      onChange={e => setReplyText(p => ({ ...p, [review.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleReply(review.id)}>Publicar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setReplyingId(null)}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setReplyingId(review.id)}>
                    <Reply className="mr-1.5 h-3.5 w-3.5" /> Responder
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
