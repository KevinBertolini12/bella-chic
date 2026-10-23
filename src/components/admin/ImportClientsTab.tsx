import React, { useState, useCallback } from 'react';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { Upload, CheckCircle2, AlertCircle, FileText, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ParsedRow { [key: string]: string }
interface ImportResult { ok: number; skipped: number; errors: string[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[,;|\t]/).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(/[,;|\t]/).map(v => v.trim().replace(/^"|"$/g, ''));
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function guessField(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const found = headers.find(h => h.includes(c));
    if (found) return found;
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────
interface Props { salonId: string; professionalId: string }

export const ImportClientsTab: React.FC<Props> = ({ salonId, professionalId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [nameCol, setNameCol] = useState('');
  const [phoneCol, setPhoneCol] = useState('');
  const [emailCol, setEmailCol] = useState('');
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    const text = await f.text();
    let parsed: ParsedRow[] = [];

    if (f.name.endsWith('.csv') || f.name.endsWith('.txt')) {
      parsed = parseCSV(text);
    } else if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      // Use SheetJS via CDN (already available in the project via recharts ecosystem)
      try {
        const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs' as any);
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_csv(ws);
        parsed = parseCSV(data);
      } catch {
        // Fallback: try as CSV anyway
        parsed = parseCSV(text);
      }
    } else {
      parsed = parseCSV(text);
    }

    if (parsed.length === 0) {
      toast.error('Arquivo vazio ou formato não reconhecido.');
      return;
    }

    const hdrs = Object.keys(parsed[0]);
    setRows(parsed);
    setHeaders(hdrs);

    // Auto-detect columns
    const nameGuess = guessField(hdrs, ['nome', 'name', 'cliente', 'client', 'razao', 'razão']);
    const phoneGuess = guessField(hdrs, ['telefone', 'tel', 'fone', 'celular', 'whatsapp', 'phone', 'contato', 'cel', 'mobile']);
    const emailGuess = guessField(hdrs, ['email', 'e-mail', 'mail']);

    setNameCol(nameGuess || hdrs[0] || '');
    setPhoneCol(phoneGuess || '');
    setEmailCol(emailGuess || '');
    setStep('map');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    if (!nameCol || !phoneCol) { toast.error('Selecione pelo menos as colunas de nome e telefone'); return; }
    setImporting(true);

    // Get existing phones to avoid duplicates
    const existingSnap = await getDocs(query(collection(db, `salons/${salonId}/manual_clients`)));
    const existingPhones = new Set(existingSnap.docs.map(d => (d.data().phone || '').replace(/\D/g, '')));

    const res: ImportResult = { ok: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      const name = (row[nameCol] || '').trim();
      const rawPhone = (row[phoneCol] || '').trim();
      const phone = rawPhone.replace(/\D/g, '');

      if (!name) { res.errors.push(`Linha sem nome: ${JSON.stringify(row)}`); continue; }
      if (!phone || phone.length < 8) { res.errors.push(`Telefone inválido para "${name}": ${rawPhone}`); continue; }
      if (existingPhones.has(phone)) { res.skipped++; continue; }

      try {
        await addDoc(collection(db, `salons/${salonId}/manual_clients`), {
          name, phone, professionalId,
          email: emailCol ? (row[emailCol] || '') : '',
          createdAt: Date.now(),
          importedFrom: file?.name || 'import',
        });
        existingPhones.add(phone);
        res.ok++;
      } catch (e: any) {
        res.errors.push(`Erro para "${name}": ${e.message}`);
      }
    }

    setResult(res);
    setStep('done');
    setImporting(false);
    toast.success(`${res.ok} cliente(s) importado(s)!`);
  };

  const reset = () => {
    setFile(null); setRows([]); setHeaders([]);
    setNameCol(''); setPhoneCol(''); setEmailCol('');
    setResult(null); setStep('upload');
  };

  const downloadTemplate = () => {
    const csv = 'nome,telefone,email\nJoão Silva,(11) 99999-1234,joao@email.com\nMaria Souza,(11) 98888-5678,';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'template_clientes.csv';
    a.click();
  };

  return (
    <div className="space-y-4">

      {/* Instructions toggle */}
      <Card className="border-blue-200 bg-blue-50">
        <button className="w-full text-left" onClick={() => setShowInstructions(v => !v)}>
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm text-blue-800 flex items-center justify-between">
              <span>📖 Como exportar do SalonSoft (ou qualquer sistema)</span>
              {showInstructions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
        </button>
        {showInstructions && (
          <CardContent className="pt-0 pb-3 text-xs text-blue-800 space-y-2">
            <div className="space-y-1">
              <p className="font-semibold">SalonSoft:</p>
              <p>1. Acesse o sistema pelo computador</p>
              <p>2. Vá em <strong>Relatórios → Clientes</strong></p>
              <p>3. Clique em <strong>Exportar</strong> ou <strong>Excel/CSV</strong></p>
              <p>4. Salve o arquivo e faça upload aqui</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Outros sistemas:</p>
              <p>Procure por "Exportar clientes", "Relatório de clientes" ou "Backup". Qualquer CSV ou Excel funciona — nosso sistema detecta as colunas automaticamente.</p>
            </div>
            <p className="font-semibold">Não tem como exportar?</p>
            <p>Baixe nosso template e preencha manualmente:</p>
            <Button size="sm" variant="outline" className="border-blue-300 text-blue-700" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar template CSV
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center space-y-3 cursor-pointer hover:border-primary/60 transition-colors"
          onClick={() => document.getElementById('import-file-input')?.click()}
        >
          <Upload className="h-10 w-10 mx-auto text-primary/60" />
          <div>
            <p className="font-semibold text-sm">Arraste o arquivo aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">Suporta CSV, XLSX (Excel) e TXT com qualquer delimitador</p>
          </div>
          <input id="import-file-input" type="file" accept=".csv,.xlsx,.xls,.txt"
            className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          <p className="text-xs text-muted-foreground">
            📋 Funciona com SalonSoft, iSalon, Trinks, Fresha, Booksy e qualquer planilha
          </p>
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === 'map' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> {file?.name}
            </CardTitle>
            <CardDescription>{rows.length} linha(s) encontrada(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">Identifique as colunas do seu arquivo:</p>

            {[
              { label: 'Coluna do NOME *', value: nameCol, setter: setNameCol, required: true },
              { label: 'Coluna do TELEFONE *', value: phoneCol, setter: setPhoneCol, required: true },
              { label: 'Coluna do EMAIL (opcional)', value: emailCol, setter: setEmailCol, required: false },
            ].map(({ label, value, setter, required }) => (
              <div key={label} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{label}</label>
                <select value={value} onChange={e => setter(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  {!required && <option value="">— Não importar —</option>}
                  {headers.map(h => (
                    <option key={h} value={h}>
                      {h} {rows[0]?.[h] ? `(ex: "${rows[0][h]}")` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {/* Preview */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Preview (primeiros 3):</p>
              <div className="rounded-lg border divide-y text-xs">
                {rows.slice(0, 3).map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-medium min-w-0 truncate">{nameCol ? row[nameCol] : '—'}</span>
                    <span className="text-muted-foreground">{phoneCol ? row[phoneCol] : '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleImport} disabled={importing || !nameCol || !phoneCol}>
                {importing ? `Importando... (${rows.length} linhas)` : `Importar ${rows.length} clientes`}
              </Button>
              <Button variant="outline" onClick={reset}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Done */}
      {step === 'done' && result && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <p className="text-lg font-bold">Importação concluída!</p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                <p className="text-2xl font-bold text-green-600">{result.ok}</p>
                <p className="text-xs text-green-700">Importados</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Já existiam</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                <p className="text-2xl font-bold text-red-500">{result.errors.length}</p>
                <p className="text-xs text-red-700">Erros</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Linhas com erro:
                </p>
                {result.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-red-600 truncate">{e}</p>
                ))}
              </div>
            )}

            <Button className="w-full" onClick={reset}>Importar outro arquivo</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
