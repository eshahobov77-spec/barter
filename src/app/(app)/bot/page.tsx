import { requireAdmin } from '@/lib/auth';
import { isConfigured, loadSettings, maskedToken } from '@/lib/telegram';
import prisma from '@/lib/db';
import { dmy, dmyhm, fmtSom, phoneFmt } from '@/lib/format';
import { dueInfo, REMINDER_KIND } from '@/lib/reminders';
import { unlinkSupplierChatAction } from '@/actions/bot';
import BotSettingsForm from './BotSettingsForm';
import SupplierBotForm from './SupplierBotForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bot sozlamalari' };

export default async function BotPage() {
  await requireAdmin();
  const s = await loadSettings();

  const chats = await prisma.supplierChat.findMany({ orderBy: { linkedAt: 'desc' }, take: 200 });
  const chatCount = await prisma.supplierChat.count({ where: { isActive: true } });
  const phoneRows = chats.length
    ? await prisma.supplierPhone.findMany({
        where: { phone: { in: [...new Set(chats.map((c) => c.phone))] } },
        include: { supplier: { select: { fullName: true, _count: { select: { contracts: true } } } } },
      })
    : [];
  const byPhone = new Map<string, { names: string[]; contracts: number }>();
  for (const r of phoneRows) {
    const cur = byPhone.get(r.phone) || { names: [], contracts: 0 };
    if (!cur.names.includes(r.supplier.fullName)) cur.names.push(r.supplier.fullName);
    cur.contracts += r.supplier._count.contracts;
    byPhone.set(r.phone, cur);
  }

  const logs = await prisma.reminderLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { contract: { select: { number: true, tjm: { select: { name: true } }, supplier: { select: { fullName: true } } } } },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bot sozlamalari</h1>
          <p>Telegram orqali kunlik va haftalik hisobotlar</p>
        </div>
        <div className="actions">
          {isConfigured(s) ? (
            <span className="badge ok">Sozlangan</span>
          ) : (
            <span className="badge warn">Token yoki Chat ID kiritilmagan</span>
          )}
        </div>
      </div>

      <BotSettingsForm
        s={{
          hasToken: !!s.token,
          maskedToken: maskedToken(s.token),
          chatIds: s.chatIds,
          dailyEnabled: s.dailyEnabled,
          dailyTime: s.dailyTime,
          weeklyEnabled: s.weeklyEnabled,
          weeklyDay: s.weeklyDay,
          notifyPayments: s.notifyPayments,
          notifyNew: s.notifyNew,
          notifyClosed: s.notifyClosed,
          commandsEnabled: s.commandsEnabled,
          lastDailySent: s.lastDailySent ? dmy(s.lastDailySent) : '',
          lastWeeklySent: s.lastWeeklySent ? dmy(s.lastWeeklySent) : '',
        }}
      />

      <SupplierBotForm
        s={{
          supplierBotEnabled: s.supplierBotEnabled,
          remindEnabled: s.remindEnabled,
          remindDueDay: s.remindDueDay,
          remindDaysBefore: s.remindDaysBefore,
          remindOverdueEvery: s.remindOverdueEvery,
          remindTime: s.remindTime,
          supportPhone: s.supportPhone,
          lastRemindRun: s.lastRemindRun ? dmy(s.lastRemindRun) : '',
          nextDue: dmy(dueInfo(s.remindDueDay, new Date()).upcoming),
        }}
      />

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Botga ulangan barterchilar</h2>
            <p>
              Faol: {chatCount} ta. Barterchi botda <span className="code">/start</span> bosib, telefon raqamini
              tasdiqlaydi — raqam shartnomadagi raqam bilan mos kelishi kerak.
            </p>
          </div>
        </header>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Barterchi</th>
                <th>Telefon</th>
                <th>Telegram</th>
                <th className="num">Shartnomalar</th>
                <th>Ulangan</th>
                <th>Oxirgi faollik</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {chats.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Hali hech kim ulanmagan
                  </td>
                </tr>
              )}
              {chats.map((c) => {
                const info = byPhone.get(c.phone);
                return (
                  <tr key={c.id}>
                    <td>
                      {info?.names.join(', ') || <span className="muted">— raqam endi hech kimga tegishli emas</span>}
                      {!c.isActive && (
                        <>
                          {' '}
                          <span className="badge bad">Botni bloklagan</span>
                        </>
                      )}
                    </td>
                    <td>{phoneFmt(c.phone)}</td>
                    <td>
                      {c.tgName}
                      {c.tgUsername && <small className="muted"> @{c.tgUsername}</small>}
                    </td>
                    <td className="num">{info?.contracts ?? 0}</td>
                    <td>{dmy(c.linkedAt)}</td>
                    <td>{dmyhm(c.lastSeenAt)}</td>
                    <td>
                      <form action={unlinkSupplierChatAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn btn-danger sm" type="submit">
                          Uzish
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Yuborilgan eslatmalar</h2>
            <p>Oxirgi 50 ta</p>
          </div>
        </header>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Shartnoma</th>
                <th>Barterchi</th>
                <th>Turi</th>
                <th>Muddat</th>
                <th className="num">Qarzdorlik</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Hali eslatma yuborilmagan
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{dmyhm(l.createdAt)}</td>
                  <td>
                    № {l.contract.number}
                    <br />
                    <small className="muted">{l.contract.tjm.name}</small>
                  </td>
                  <td>{l.contract.supplier.fullName}</td>
                  <td>{REMINDER_KIND[l.kind] || l.kind}</td>
                  <td>{dmy(l.dueDate)}</td>
                  <td className="num">{fmtSom(l.amount)}</td>
                  <td>
                    {l.ok ? (
                      <span className="badge ok">Yuborildi</span>
                    ) : (
                      <span className="badge bad" title={l.error}>
                        Xato
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
