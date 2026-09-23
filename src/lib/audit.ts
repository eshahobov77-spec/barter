import prisma from './db';
import { headersIp } from './auth';
import type { SessionUser } from './auth';

type LogOpts = {
  action: string;
  detail?: string;
  user?: SessionUser | null;
  username?: string;
  objectType?: string;
  objectId?: string | number;
  ip?: string | null;
};

/** Audit yozuvi. Xatolik asosiy amalni hech qachon to'xtatmaydi. */
export async function logAction(opts: LogOpts): Promise<void> {
  try {
    const ip = opts.ip !== undefined ? opts.ip : await headersIp();
    await prisma.auditLog.create({
      data: {
        userId: opts.user?.id ?? null,
        username: opts.username ?? opts.user?.username ?? '',
        action: opts.action,
        detail: String(opts.detail ?? '').slice(0, 2000),
        objectType: opts.objectType ?? '',
        objectId: opts.objectId !== undefined && opts.objectId !== null ? String(opts.objectId) : '',
        ip,
      },
    });
  } catch (e) {
    console.error('Audit yozuvini saqlab bo‘lmadi:', e);
  }
}
