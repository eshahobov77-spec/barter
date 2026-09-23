/** Telefoniya API kirishi: token (Bearer / X-Api-Key / ?token=) va ixtiyoriy HMAC imzo. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import prisma from '../db';

export async function loadTelSettings() {
  return prisma.telephonySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): { token: string; hash: string; hint: string } {
  const token = 'tlp_' + randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token), hint: token.slice(0, 8) + '…' + token.slice(-4) };
}

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function tokenFromRequest(req: Request): string {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1].trim();
  const k = req.headers.get('x-api-key');
  if (k) return k.trim();
  return new URL(req.url).searchParams.get('token') || '';
}

export function checkToken(req: Request, settings: { tokenHash: string }): boolean {
  const t = tokenFromRequest(req);
  if (!t || !settings.tokenHash) return false;
  return safeEq(hashToken(t), settings.tokenHash);
}

/** X-Signature: sha256=<hex> yoki <hex> — xom tanadan HMAC-SHA256. */
export function checkHmac(raw: string, header: string | null, secret: string): boolean {
  if (!secret) return true;
  if (!header) return false;
  const sig = header.replace(/^sha256=/i, '').trim().toLowerCase();
  const expect = createHmac('sha256', secret).update(raw).digest('hex');
  return safeEq(sig, expect);
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
}
