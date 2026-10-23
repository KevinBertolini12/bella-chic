import React, { useState, useEffect } from 'react';
import { Gift, Star, TrendingUp, Award, Zap, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy, increment } from 'firebase/firestore';
import { LoyaltyConfig, LoyaltyAccount } from '../../types';

// ─── Default config ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG: LoyaltyConfig = {
  enabled: false,
  pointsPerVisit: 10,
  pointsPerReal: 0,
  rewardThreshold: 100,
  rewardDescription: '1 serviço grátis de até R$ 50',
  rewardValue: 50,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useLoyalty(salonId: string) {
  const [config, setConfig] = useState<LoyaltyConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (!salonId) return;
    getDoc(doc(db, `salons/${salonId}/settings/loyalty`)).then(snap => {
      if (snap.exists()) setConfig({ ...DEFAULT_CONFIG, ...snap.data() as LoyaltyConfig });
    });
  }, [salonId]);

  const saveConfig = async (newConfig: LoyaltyConfig) => {
    await setDoc(doc(db, `salons/${salonId}/settings/loyalty`), newConfig);
    setConfig(newConfig);
  };

  const addPoints = async (clientId: string, clientName: string, points: number, spent = 0) => {
    if (!config.enabled || points <= 0) return;
    const ref = doc(db, `salons/${salonId}/loyalty/${clientId}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        points: increment(points),
        totalVisits: increment(1),
        totalSpent: increment(spent),
        lastVisit: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await setDoc(ref, {
        clientId, clientName, salonId,
        points, totalVisits: 1, totalSpent: spent,
        redeemedRewards: 0, lastVisit: Date.now(), updatedAt: Date.now(),
      } as LoyaltyAccount);
    }
  };

  return { config, saveConfig, addPoints };
}

// ─── Client: pontos do cliente ────────────────────────────────────────────────
export const LoyaltyCard: React.FC<{ salonId: string; clientId: string }> = ({ salonId, clientId }) => {
  const { config } = useLoyalty(salonId);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);

  useEffect(() => {
    if (!salonId || !clientId || !config.enabled) return;
    getDoc(doc(db, `salons/${salonId}/loyalty/${clientId}`)).then(snap => {
      if (snap.exists()) setAccount(snap.data() as LoyaltyAccount);
    });
  }, [salonId, clientId, config.enabled]);

  if (!config.enabled) return null;

  const progress = account ? Math.min((account.points / config.rewardThreshold) * 100, 100) : 0;
  const canRedeem = account ? account.points >= config.rewardThreshold : false;

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <Gift className="h-5 w-5" />
          Programa de Fidelidade
        </CardTitle>
        <CardDescription className="text-amber-700">
          Acumule pontos e ganhe prêmios!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pontos */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl sm:text-4xl font-bold text-amber-600">
              {account?.points || 0}
            </div>
            <div className="text-sm text-amber-700">pontos acumulados</div>
          </div>
          <div className="text-right text-sm text-amber-700">
            <div className="font-semibold">{config.rewardThreshold} pts</div>
            <div>para o prêmio</div>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="space-y-1">
          <div className="h-3 rounded-full bg-amber-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-amber-600">
            <span>{account?.points || 0} pts</span>
            <span>{Math.max(0, config.rewardThreshold - (account?.points || 0))} pts para o próximo prêmio</span>
          </div>
        </div>

        {/* Prêmio */}
        <div className="rounded-xl bg-white/60 border border-amber-200 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-amber-800 mb-1">
            <Award className="h-4 w-4" />
            Prêmio disponível:
          </div>
          <p className="text-amber-700">{config.rewardDescription}</p>
          {canRedeem && (
            <Badge className="mt-2 bg-green-500 hover:bg-green-600">
              🎉 Você atingiu o prêmio! Fale com o salão.
            </Badge>
          )}
        </div>

        {/* Stats */}
        {account && (
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white/60 p-2">
              <div className="font-bold text-amber-700">{account.totalVisits}</div>
              <div className="text-amber-600">visitas</div>
            </div>
            <div className="rounded-lg bg-white/60 p-2">
              <div className="font-bold text-amber-700">{account.redeemedRewards}</div>
              <div className="text-amber-600">prêmios resgatados</div>
            </div>
          </div>
        )}

        {/* Como ganhar pontos */}
        <div className="text-xs text-amber-600 space-y-0.5">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>+{config.pointsPerVisit} pontos por atendimento</span>
          </div>
          {config.pointsPerReal > 0 && (
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              <span>+{config.pointsPerReal} ponto por R$1 gasto</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Admin: configuração e ranking ────────────────────────────────────────────
export const LoyaltyAdmin: React.FC<{ salonId: string }> = ({ salonId }) => {
  const { config, saveConfig } = useLoyalty(salonId);
  const [localConfig, setLocalConfig] = useState<LoyaltyConfig>(config);
  const [ranking, setRanking] = useState<LoyaltyAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'config' | 'ranking'>('config');

  useEffect(() => { setLocalConfig(config); }, [config]);

  useEffect(() => {
    if (!salonId) return;
    getDocs(query(collection(db, `salons/${salonId}/loyalty`), orderBy('points', 'desc')))
      .then(snap => setRanking(snap.docs.map(d => d.data() as LoyaltyAccount)));
  }, [salonId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig(localConfig);
      toast.success('Configurações de fidelidade salvas!');
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleRedeem = async (clientId: string) => {
    if (!confirm('Confirmar resgate do prêmio? Os pontos serão zerados.')) return;
    await updateDoc(doc(db, `salons/${salonId}/loyalty/${clientId}`), {
      points: 0,
      redeemedRewards: increment(1),
      updatedAt: Date.now(),
    });
    setRanking(prev => prev.map(a => a.clientId === clientId ? { ...a, points: 0, redeemedRewards: a.redeemedRewards + 1 } : a));
    toast.success('Prêmio resgatado e pontos zerados!');
  };

  return (
    <div className="space-y-4">
      {/* Tab toggle */}
      <div className="flex rounded-lg border overflow-hidden w-fit">
        <button onClick={() => setTab('config')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'config' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          Configurações
        </button>
        <button onClick={() => setTab('ranking')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'ranking' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          Ranking de Clientes
        </button>
      </div>

      {tab === 'config' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" /> Programa de Fidelidade
            </CardTitle>
            <CardDescription>Configure os pontos e prêmios para fidelizar seus clientes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-semibold">Ativar programa de fidelidade</p>
                <p className="text-sm text-muted-foreground">Quando ativo, clientes acumulam pontos a cada visita.</p>
              </div>
              <button
                onClick={() => setLocalConfig(p => ({ ...p, enabled: !p.enabled }))}
                className={`relative h-6 w-11 rounded-full transition-colors ${localConfig.enabled ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${localConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {localConfig.enabled && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Pontos por visita (atendimento)</Label>
                  <Input type="number" min="1"
                    value={localConfig.pointsPerVisit}
                    onChange={e => setLocalConfig(p => ({ ...p, pontosPerVisit: Number(e.target.value), pointsPerVisit: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Pontos por R$1 gasto (0 = desativado)</Label>
                  <Input type="number" min="0" step="0.5"
                    value={localConfig.pointsPerReal}
                    onChange={e => setLocalConfig(p => ({ ...p, pointsPerReal: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Pontos necessários para o prêmio</Label>
                  <Input type="number" min="1"
                    value={localConfig.rewardThreshold}
                    onChange={e => setLocalConfig(p => ({ ...p, rewardThreshold: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Valor do prêmio (R$)</Label>
                  <Input type="number" min="0"
                    value={localConfig.rewardValue}
                    onChange={e => setLocalConfig(p => ({ ...p, rewardValue: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descrição do prêmio</Label>
                  <Input placeholder="Ex: 1 serviço grátis de até R$50"
                    value={localConfig.rewardDescription}
                    onChange={e => setLocalConfig(p => ({ ...p, rewardDescription: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Only show save button when there are meaningful settings to save */}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : localConfig.enabled ? 'Salvar configurações' : 'Desativar programa'}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'ranking' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Clientes por Pontos</CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Nenhum cliente com pontos ainda.</div>
            ) : (
              <div className="space-y-2">
                {ranking.map((account, idx) => (
                  <div key={account.clientId} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-3 gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-gray-300 text-gray-700' : idx === 2 ? 'bg-orange-300 text-white' : 'bg-muted text-muted-foreground'}`}>
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-sm">{account.clientName}</p>
                        <p className="text-xs text-muted-foreground">{account.totalVisits} visitas · R$ {account.totalSpent?.toFixed(2) || '0,00'} gastos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={account.points >= config.rewardThreshold ? 'default' : 'outline'}>
                        {account.points} pts
                      </Badge>
                      {account.points >= config.rewardThreshold && (
                        <Button size="sm" variant="outline" className="text-green-600 border-green-300"
                          onClick={() => handleRedeem(account.clientId)}>
                          <Gift className="mr-1 h-3.5 w-3.5" /> Resgatar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
