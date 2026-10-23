import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSalon } from '../../contexts/SalonContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';
import { FileUpload } from './FileUpload';

interface CreateProfessionalUserFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  services: { id: string; name: string }[];
}

export const CreateProfessionalUserForm: React.FC<CreateProfessionalUserFormProps> = ({
  open,
  onOpenChange,
  onSuccess,
  services,
}) => {
  const { user } = useAuth();
  const { salonId } = useSalon();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    bio: '',
    specialties: [] as string[],
    photoURL: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salonId) return;
    if (!formData.name.trim()) { toast.error('Nome é obrigatório.'); return; }
    if (!formData.email.trim()) { toast.error('Email é obrigatório.'); return; }
    if (formData.password.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return; }

    setLoading(true);
    try {
      const idToken = await user!.getIdToken();
      const response = await fetch('/api/admin/create-professional-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          displayName: formData.name,
          salonId,
          bio: formData.bio,
          specialties: formData.specialties,
          photoURL: formData.photoURL,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao criar profissional');
      }

      toast.success('Profissional criado com sucesso!');
      onSuccess();
      onOpenChange(false);
      setFormData({ name: '', email: '', password: '', bio: '', specialties: [], photoURL: '' });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSpecialty = (id: string) => {
    setFormData(prev => ({
      ...prev,
      specialties: prev.specialties.includes(id)
        ? prev.specialties.filter(s => s !== id)
        : [...prev.specialties, id],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto rounded-xl shadow-lg">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserPlus className="h-6 w-6" />
          </div>
          <DialogTitle className="text-2xl font-bold">Adicionar Profissional</DialogTitle>
          <DialogDescription>
            Crie um usuário para um profissional. Ele poderá acessar o sistema com email e senha.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prof-name" className="text-sm font-semibold">Nome completo</Label>
            <Input
              id="prof-name"
              placeholder="Ex: Ana Carolina"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="rounded-lg border-gray-200 focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-email" className="text-sm font-semibold">Email</Label>
            <Input
              id="prof-email"
              type="email"
              placeholder="profissional@exemplo.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="rounded-lg border-gray-200 focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-password" className="text-sm font-semibold">Senha (mínimo 6 caracteres)</Label>
            <Input
              id="prof-password"
              type="password"
              placeholder="********"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              className="rounded-lg border-gray-200 focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-bio" className="text-sm font-semibold">Bio / Especialidade</Label>
            <Input
              id="prof-bio"
              placeholder="Especialista em cortes e coloração"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="rounded-lg border-gray-200 focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Foto do Profissional</Label>
            <FileUpload
              label="Foto"
              path="professionals"
              currentUrl={formData.photoURL}
              onUploadComplete={(url) => setFormData({ ...formData, photoURL: url })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Especialidades (Serviços)</Label>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      formData.specialties.includes(service.id)
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    onClick={() => toggleSpecialty(service.id)}
                  >
                    {service.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Criando...' : 'Criar Profissional'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};