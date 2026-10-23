import React, { useState, useEffect } from 'react';
import { Professional, SalonService } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { salonService } from '../../services/salonService';
import { toast } from 'sonner';
import { Loader2, Phone } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { Badge } from '../ui/badge';
import { useSalon } from '../../contexts/SalonContext';

interface ProfessionalFormProps {
  professional?: Professional;
  onSuccess: () => void;
  onCancel: () => void;
}

export const ProfessionalForm: React.FC<ProfessionalFormProps> = ({
  professional,
  onSuccess,
  onCancel
}) => {
  const { salonId } = useSalon();
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<SalonService[]>([]);
  const [formData, setFormData] = useState({
    displayName: professional?.displayName || '',
    bio: professional?.bio || '',
    specialties: (professional?.specialties || []) as string[],
    active: professional?.active ?? true,
    photoURL: professional?.photoURL || '',
    userId: professional?.userId || crypto.randomUUID(),
    // Campo de telefone para lembretes via WhatsApp
    phone: (professional as any)?.phone || '',
  });

  useEffect(() => {
    const fetchServices = async () => {
      if (!salonId) return;
      try {
        const data = await salonService.getServices(salonId);
        setServices(data);
      } catch (error) {
        console.error(error);
        toast.error('Erro ao carregar serviços.');
      }
    };
    fetchServices();
  }, [salonId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salonId) { toast.error('ID do salão não encontrado.'); return; }
    setLoading(true);
    try {
      if (professional) {
        await salonService.updateProfessional(salonId, professional.id, formData);
        toast.success('Profissional atualizado com sucesso!');
      } else {
        await salonService.addProfessional(salonId, formData);
        toast.success('Profissional adicionado com sucesso!');
      }
      onSuccess();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar profissional.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSpecialty = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(id)
        ? prev.specialties.filter((sId) => sId !== id)
        : [...prev.specialties, id],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="displayName">Nome do Profissional *</Label>
          <Input
            id="displayName"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            placeholder="Ex: Ana Lima"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-green-600" />
            WhatsApp (lembretes automáticos)
          </Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="(11) 99999-9999"
          />
          <p className="text-[11px] text-muted-foreground">
            Se preenchido, o profissional recebe a agenda do dia e lembretes de agendamentos.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio / Especialidade</Label>
        <Input
          id="bio"
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          placeholder="Ex: Especialista em coloração e mechas"
          required
        />
      </div>

      <FileUpload
        label="Foto do Profissional"
        path="professionals"
        currentUrl={formData.photoURL}
        onUploadComplete={(url) => setFormData({ ...formData, photoURL: url })}
      />

      <div className="space-y-2">
        <Label>Especialidades (Serviços)</Label>
        <div className="flex flex-wrap gap-2">
          {services.map((service) => (
            <Badge
              key={service.id}
              variant={formData.specialties.includes(service.id) ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => toggleSpecialty(service.id)}
            >
              {service.name}
            </Badge>
          ))}
          {services.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum serviço cadastrado ainda.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {professional ? 'Atualizar' : 'Adicionar'} Profissional
        </Button>
      </div>
    </form>
  );
};
