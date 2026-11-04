// Procura segredos esquecidos nos arquivos versionados (chaves de API, chaves privadas, senhas de banco).
// Uso: node zapbot/scripts/check-secrets.mjs   (roda também no CI a cada push e Pull Request)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RULES = [
  ['Chave de API do Google', /AIza[0-9A-Za-z_-]{35}/],
  ['Chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Token do GitHub', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ['Chave de API (sk-)', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Senha em URL de banco', /postgres(?:ql)?:\/\/[^\s:@/]+:(?!senha\b|password\b|SENHA\b)[^\s@/]{4,}@(?!localhost|127\.0\.0\.1)[^\s/]+/],
  ['Segredo atribuído no código', /\b(?:AUTH_SECRET|DATA_ENCRYPTION_KEY|GEMINI_API_KEY|REGISTRATION_CODE)\s*[=:]\s*["']?[A-Za-z0-9_\-+/=]{16,}/],
];
const SKIP_FILES = /(^|\/)(package-lock\.json|test\/|scripts\/)/;

/** Lista os achados de um arquivo: [{ file, line, rule }]. */
export function findSecrets(file, content) {
  if (SKIP_FILES.test(file)) return [];
  const found = [];
  content.split('\n').forEach((text, i) => {
    for (const [rule, re] of RULES) if (re.test(text)) found.push({ file, line: i + 1, rule });
  });
  return found;
}

function main() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const hits = [];
  for (const f of files) {
    const full = path.join(root, f);
    let buf; try { buf = fs.readFileSync(full); } catch { continue; }
    if (buf.length > 1_000_000 || buf.includes(0)) continue; // grande demais ou binário
    hits.push(...findSecrets(f, buf.toString('utf8')));
  }
  if (hits.length) {
    console.error('❌ Possíveis segredos no repositório:');
    for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.rule}`);
    console.error('Remova do código, gere uma chave nova (a antiga já vazou) e use variáveis de ambiente.');
    process.exit(1);
  }
  console.log(`✅ Nenhum segredo encontrado em ${files.length} arquivos.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
