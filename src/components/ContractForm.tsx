'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save } from 'lucide-react';
import { saveContractAction, type ContractFormState } from '@/actions/contract';
import { MATERIAL_GROUP_CHOICES, SUPPLY_STATUS_CHOICES } from '@/lib/constants';
import MoneyInput from './MoneyInput';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      <Save className="lucide" />
      {pending ? 'Saqlanmoqda…' : label}
    </button>
  );
}

export type ContractFormProps = {
  editId?: number;
  tjms: { id: number; name: string }[];
  materials: string[];
  initial: Record<string, string>;
};

export default function ContractForm({ editId, tjms, materials, initial }: ContractFormProps) {
  const [state, formAction] = useActionState<ContractFormState, FormData>(saveContractAction, {});
  const v = { ...initial, ...(state?.values || {}) };
  const err = state?.errors || {};
  const isEdit = !!editId;
  // Validatsiyadan qaytgach maydonlar (jumladan summa maydonlari) yangilansin
  const formKey = state?.values ? JSON.stringify(state.values) : 'initial';

  const field = (key: string) => (err[key] ? 'field has-error' : 'field');

  return (
    <form action={formAction} className="panel">
      {editId ? <input type="hidden" name="editId" value={editId} /> : null}
      <div className="panel-body" key={formKey}>
        {state?.error && <div className="flash error">{state.error}</div>}
        <div className="form-grid">
          <div className={field('supplierName')}>
            <label htmlFor="supplierName">Barterchi F.I.SH</label>
            <input
              id="supplierName"
              type="text"
              name="supplierName"
              maxLength={200}
              defaultValue={v.supplierName || ''}
              required
            />
            {err.supplierName && <small className="error">{err.supplierName}</small>}
          </div>

          <div className={field('phones')}>
            <label htmlFor="phones">Telefon(lar)</label>
            <input id="phones" type="text" name="phones" defaultValue={v.phones || ''} />
            <small className="help">
              Bir nechta bo&apos;lsa vergul bilan: +998901234567, +998911234567
            </small>
            {err.phones && <small className="error">{err.phones}</small>}
          </div>

          <div className={field('tjmId')}>
            <label htmlFor="tjmId">TJM</label>
            <select id="tjmId" name="tjmId" defaultValue={v.tjmId || ''} required>
              <option value="">TJM tanlang</option>
              {tjms.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
            {err.tjmId && <small className="error">{err.tjmId}</small>}
          </div>

          <div className={field('number')}>
            <label htmlFor="number">Shartnoma raqami</label>
            <input
              id="number"
              type="text"
              name="number"
              maxLength={50}
              defaultValue={v.number || ''}
              required
            />
            {err.number && <small className="error">{err.number}</small>}
          </div>

          <div className={field('contractDate')}>
            <label htmlFor="contractDate">Shartnoma sanasi</label>
            <input
              id="contractDate"
              type="datetime-local"
              name="contractDate"
              defaultValue={v.contractDate || ''}
            />
          </div>

          <div className={field('totalAmount')}>
            <label htmlFor="totalAmount">Umumiy summa (so&apos;m)</label>
            <MoneyInput id="totalAmount" name="totalAmount" defaultValue={v.totalAmount || ''} required />
            {err.totalAmount && <small className="error">{err.totalAmount}</small>}
          </div>

          {!isEdit && (
            <div className={field('openingPaid')}>
              <label htmlFor="openingPaid">Berilgan chek (boshlang&apos;ich)</label>
              <MoneyInput id="openingPaid" name="openingPaid" defaultValue={v.openingPaid || ''} />
              {err.openingPaid && <small className="error">{err.openingPaid}</small>}
            </div>
          )}

          <div className={field('monthlyAmount')}>
            <label htmlFor="monthlyAmount">Qarzdorlik summasi</label>
            <MoneyInput id="monthlyAmount" name="monthlyAmount" defaultValue={v.monthlyAmount || ''} />
            <small className="help">
              Grafik bo&apos;yicha hozir to&apos;lanmagan summa. Keyingi tushumlar avval shuni yopadi.
            </small>
            {err.monthlyAmount && <small className="error">{err.monthlyAmount}</small>}
          </div>

          <div className={field('materialType')}>
            <label htmlFor="materialType">Hom ashyo</label>
            <input
              id="materialType"
              type="text"
              name="materialType"
              maxLength={60}
              list="material-list"
              defaultValue={v.materialType || ''}
            />
          </div>

          <div className={field('materialGroup')}>
            <label htmlFor="materialGroup">Guruh</label>
            <select id="materialGroup" name="materialGroup" defaultValue={v.materialGroup || 'material'}>
              {MATERIAL_GROUP_CHOICES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className={field('supplyStatus')}>
            <label htmlFor="supplyStatus">Yetkazib berish holati</label>
            <select id="supplyStatus" name="supplyStatus" defaultValue={v.supplyStatus || ''}>
              <option value="">Belgilanmagan</option>
              {SUPPLY_STATUS_CHOICES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {!isEdit && (
            <div className="field wide">
              <label htmlFor="note">Izoh</label>
              <textarea id="note" name="note" rows={2} defaultValue={v.note || ''} />
            </div>
          )}
        </div>

        <datalist id="material-list">
          {materials.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <div className="form-actions">
          <Submit label={isEdit ? "O'zgarishlarni saqlash" : "Shartnomani qo'shish"} />
        </div>
      </div>
    </form>
  );
}
