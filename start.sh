#!/bin/bash
# ─── start.sh — Bella & Chic startup script ───────────────────────────────────
# Carrega o .env corretamente via Python (trata chave PEM com \n literal)
# e passa as variáveis para o tsx antes de iniciar o servidor.

cd /root/bella-chic

# Usa Python para parsear o .env de forma segura e exportar as variáveis
eval "$(python3 -c "
import re, sys, os

with open('/root/bella-chic/.env') as f:
    content = f.read()

pattern = re.compile(r'^([A-Z_][A-Z0-9_]*)=(\"(?:[^\"\\\\]|\\\\.)*\"|[^\n\r]*)', re.MULTILINE)

for m in pattern.finditer(content):
    key = m.group(1)
    val = m.group(2).strip()
    
    # Remove aspas duplas externas
    if val.startswith('\"') and val.endswith('\"'):
        val = val[1:-1]
    
    # Converte \n literal em newline real (necessário para chave PEM do Firebase)
    val = val.replace('\\\\n', '\n')
    
    # Escapa para uso no eval do bash
    val_escaped = val.replace(\"'\", \"'\\\"'\\\"'\")
    
    print(f\"export {key}='{val_escaped}'\")
")"

exec /root/bella-chic/node_modules/.bin/tsx server.ts
