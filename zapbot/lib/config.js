// Verificação das variáveis de ambiente na inicialização (pura). Em produção, problema grave = o servidor não sobe.
const GEN = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;

export function configProblems(env, production) {
  const errors = []; const warnings = [];
  const secret = env.AUTH_SECRET || '';
  if (production) {
    if (secret.length < 32) errors.push(`AUTH_SECRET ausente ou curta (mínimo 32 caracteres). Gere uma com: ${GEN}`);
    if (!/^[0-9a-fA-F]{64}$/.test(env.DATA_ENCRYPTION_KEY || '')) errors.push(`DATA_ENCRYPTION_KEY ausente ou inválida (64 caracteres hexadecimais). Gere uma com: ${GEN}`);
    if (secret && secret === env.DATA_ENCRYPTION_KEY) errors.push('AUTH_SECRET e DATA_ENCRYPTION_KEY não podem ser iguais.');
    if (!env.DATABASE_URL) errors.push('DATABASE_URL ausente.');
    else if (env.DATABASE_SSL !== 'true' && !/localhost|127\.0\.0\.1|\.internal\b/.test(env.DATABASE_URL)) {
      warnings.push('DATABASE_SSL não está "true": a conexão com o banco pode estar sem criptografia.');
    }
    if (!env.PASSWORD_PEPPER || env.PASSWORD_PEPPER.length < 32) errors.push(`PASSWORD_PEPPER ausente ou curta (mínimo 32 caracteres). Gere uma com: ${GEN}`);
    else if ([env.AUTH_SECRET, env.DATA_ENCRYPTION_KEY].includes(env.PASSWORD_PEPPER)) errors.push('PASSWORD_PEPPER deve ser diferente de AUTH_SECRET e DATA_ENCRYPTION_KEY.');
    if (env.SUBSCRIPTION_REQUIRED !== 'false') {
      if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH || !env.ADMIN_TOTP_SECRET) errors.push('Conta de administrador não configurada (ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_TOTP_SECRET). Rode: npm run admin:setup');
      else if (!/^scrypt\$\d+\$\d+\$\d+\$/.test(env.ADMIN_PASSWORD_HASH)) errors.push('ADMIN_PASSWORD_HASH inválido: gere com npm run admin:setup (não coloque a senha em texto puro).');
      if (!/^\d{10,14}$/.test(String(env.ADMIN_WHATSAPP || '').replace(/\D/g, ''))) errors.push('ADMIN_WHATSAPP ausente ou inválido (seu número com DDD; é para onde o botão da assinatura envia o cliente).');
    }
    if (env.COOKIE_SECURE === 'false') warnings.push('COOKIE_SECURE=false: o login trafega sem HTTPS. Use só em teste.');
  } else {
    if (!secret) warnings.push('AUTH_SECRET não definida: usando segredo de desenvolvimento (NUNCA em produção).');
    if (!env.DATA_ENCRYPTION_KEY) warnings.push('DATA_ENCRYPTION_KEY não definida: a sessão do WhatsApp ficará SEM criptografia no banco (só aceitável em desenvolvimento).');
  }
  if (!production && !env.PASSWORD_PEPPER) warnings.push('PASSWORD_PEPPER não definida: senhas sem pimenta (só aceitável em desenvolvimento).');
  if (!env.GEMINI_API_KEY) warnings.push('GEMINI_API_KEY não definida: o bot não consegue responder.');
  return { errors, warnings };
}
