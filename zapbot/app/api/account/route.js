import { currentAccount } from '@/lib/session.js';
import { whatsappLink, PRICE_LABEL, subscriptionRequired, daysLeft, WARN_DAYS } from '@/lib/subscription.js';

// Situação da conta do cliente: ID, assinatura e botão do WhatsApp do administrador. Funciona mesmo sem assinatura ativa.
export async function GET() {
  const a = await currentAccount();
  if (!a) return Response.json({ error: 'Faça login para continuar' }, { status: 401 });
  const required = subscriptionRequired(process.env);
  return Response.json({
    email: a.email,
    accountCode: a.account_code,
    status: required ? a.status : 'active',
    until: a.subscription_until,
    daysLeft: required ? daysLeft(a.subscription_until) : null,
    warnDays: WARN_DAYS,
    price: PRICE_LABEL,
    whatsapp: whatsappLink(process.env.ADMIN_WHATSAPP, { code: a.account_code }),
  });
}
