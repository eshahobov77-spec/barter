'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save } from 'lucide-react';
import { saveUserAction, type UserFormState } from '@/actions/users';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      <Save className="lucide" />
      {pending ? 'Saqlanmoqda…' : 'Saqlash'}
    </button>
  );
}

export default function UserForm({
  editId,
  tjms,
  initial,
}: {
  editId?: number;
  tjms: { id: number; name: string }[];
  initial: { fullName: string; username: string; role: string; isActive: boolean; tjmIds: number[] };
}) {
  const [state, formAction] = useActionState<UserFormState, FormData>(saveUserAction, {});
  const err = state?.errors || {};
  const v = { ...initial, ...(state?.values || {}) } as any;
  const checkedIds = state?.tjmIds ?? initial.tjmIds;

  const [filter, setFilter] = useState('');
  const [checked, setChecked] = useState<number[]>(checkedIds);
  const [role, setRole] = useState(initial.role);

  const visible = tjms.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));
  const allOn = visible.length > 0 && visible.every((t) => checked.includes(t.id));

  function toggleAll() {
    if (allOn) setChecked((c) => c.filter((id) => !visible.some((t) => t.id === id)));
    else setChecked((c) => [...new Set([...c, ...visible.map((t) => t.id)])]);
  }

  return (
    <form action={formAction} className="panel" autoComplete="off">
      {editId ? <input type="hidden" name="editId" value={editId} /> : null}
      <div className="panel-body">
        {state?.error && <div className="flash error">{state.error}</div>}
        <div className="form-grid">
          <div className={err.fullName ? 'field has-error' : 'field'}>
            <label htmlFor="fullName">F.I.SH</label>
            <input id="fullName" type="text" name="fullName" defaultValue={v.fullName} required />
            {err.fullName && <small className="error">{err.fullName}</small>}
          </div>
          <div className={err.username ? 'field has-error' : 'field'}>
            <label htmlFor="username">Login</label>
            <input id="username" type="text" name="username" defaultValue={v.username} required />
            {err.username && <small className="error">{err.username}</small>}
          </div>
          <div className={err.password ? 'field has-error' : 'field'}>
            <label htmlFor="password">Parol</label>
            <input id="password" type="password" name="password" autoComplete="new-password" />
            <small className="help">
              {editId
                ? "Tahrirlashda bo'sh qoldirsangiz, eski parol o'zgarmaydi."
                : 'Kamida 6 ta belgi.'}
            </small>
            {err.password && <small className="error">{err.password}</small>}
          </div>
          <div className={err.role ? 'field has-error' : 'field'}>
            <label htmlFor="role">Rol</label>
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="manager">Menejer</option>
              <option value="admin">Admin</option>
            </select>
            {err.role && <small className="error">{err.role}</small>}
          </div>

          <div className={`field wide${err.tjms ? ' has-error' : ''}`}>
            <label>TJMlar (menejer uchun)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="search"
                placeholder="TJM qidirish…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button type="button" className="btn btn-ghost" onClick={toggleAll}>
                {allOn ? 'Belgilarni olib tashlash' : 'Hammasini belgilash'}
              </button>
            </div>
            <div className="checkbox-grid" id="tjm-list">
              {tjms.length === 0 && (
                <span className="muted">TJM yo&apos;q — avval Excel import qiling.</span>
              )}
              {/* Qidiruv bilan yashiringan, lekin belgilangan TJMlar yo'qolib ketmasligi uchun */}
              {checked
                .filter((id) => !visible.some((t) => t.id === id))
                .map((id) => (
                  <input key={`hidden-${id}`} type="hidden" name="tjms" value={id} />
                ))}
              {visible.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    name="tjms"
                    value={t.id}
                    checked={checked.includes(t.id)}
                    onChange={(e) =>
                      setChecked((c) =>
                        e.target.checked ? [...c, t.id] : c.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.name}
                </label>
              ))}
            </div>
            {role === 'admin' && (
              <small className="help">Admin barcha TJMlarni ko&apos;radi, tanlash shart emas.</small>
            )}
            {err.tjms && <small className="error">{err.tjms}</small>}
          </div>

          <div className="field">
            <label className="check-box">
              <input type="checkbox" name="isActive" defaultChecked={initial.isActive} />
              <span>Faol (tizimga kira oladi)</span>
            </label>
          </div>
        </div>
        <div className="form-actions">
          <Submit />
        </div>
      </div>
    </form>
  );
}
