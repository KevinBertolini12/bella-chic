import React, { useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { useSalon } from '../../contexts/SalonContext';

// ─── Configuração Cloudinary ──────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = 'dyddwpxfm';
const CLOUDINARY_UPLOAD_PRESET = 'bella_chic_uploads';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

interface FileUploadProps {
  onUploadComplete: (url: string) => void;
  currentUrl?: string;
  label: string;
  path: string; // pasta no Cloudinary (ex: "branding", "products", "professionals")
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadComplete,
  currentUrl,
  label,
  path,
}) => {
  const { salon } = useSalon();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);

  // Usa o slug do salão como namespace, com fallback para "salon" genérico
  const folderPrefix = salon?.slug || 'salon';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida (JPG, PNG, WEBP...).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 10MB.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('folder', `${folderPrefix}/${path}`);

      const response = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errMsg = err.error?.message || `Erro ${response.status}`;
        // Erro mais comum: preset não configurado como unsigned no Cloudinary
        if (response.status === 400 && errMsg.includes('preset')) {
          throw new Error('Preset de upload não configurado. Verifique o Cloudinary Dashboard → Upload Presets → bella_chic_uploads → Unsigned.');
        }
        throw new Error(errMsg || 'Falha no upload');
      }

      const data = await response.json();
      if (!data.secure_url) throw new Error('URL não retornada pelo Cloudinary');
      const url = data.secure_url as string;

      setPreview(url);
      onUploadComplete(url);
      toast.success('Imagem enviada com sucesso!');
    } catch (error: any) {
      console.error('[FileUpload] error:', error);
      // Mensagem amigável baseada no tipo de erro
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        toast.error('Sem conexão com o servidor de imagens. Verifique sua internet.');
      } else if (error.message?.includes('preset')) {
        toast.error('Configuração de upload incorreta. Entre em contato com o suporte.');
      } else {
        toast.error(`Erro ao enviar imagem: ${error.message}`);
      }
    } finally {
      setUploading(false);
      // Limpa o input para permitir re-upload do mesmo arquivo
      e.target.value = '';
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUploadComplete('');
  };

  const inputId = `file-${label.replace(/\s+/g, '-')}`;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">{label}</label>

      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {preview ? (
            <>
              <img
                src={preview}
                alt="Preview"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={handleRemove}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                title="Remover imagem"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <Upload className="h-6 w-6" />
              <span className="text-[10px]">Sem imagem</span>
            </div>
          )}

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            {uploading ? (
              <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Enviando...</>
            ) : preview ? (
              'Trocar Imagem'
            ) : (
              'Selecionar Imagem'
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground">
            JPG, PNG, WEBP — máx. 10MB
          </p>
        </div>

        <input
          id={inputId}
          type="file"
          className="hidden"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/bmp,image/tiff"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};
