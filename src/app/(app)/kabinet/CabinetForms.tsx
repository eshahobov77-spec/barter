'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save, KeyRound } from 'lucide-react';
import { changePasswordAction, updateProfileAction, type FormState } from '@/actions/auth';

function Submit({ label, icon }: { label: string; icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {icon}
      {pending ? 'Saqlanmoqda…' : label}
    </button>
  );
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateProfileAction, {});
  return (
    <form action={formAction} className="panel">
      <header className="panel-head">
        <div>
          <h2>Profil</h2>
          <p>Ismingiz tizimdagi yozuvlarda ko&apos;rinadi</p>
        </div>
      </header>
      <div className="panel-body">
        {state?.error && <div className="flash error">{state.error}</div>}
        {state?.ok && <div className="flash success">{state.message}</div>}
        <div className="form-grid">
          <div className="field wide">
            <label htmlFor="fullName">F.I.SH</label>
            <input id="fullName" type="text" name="fullName" defaultValue={fullName} required />
          </div>
        </div>
        <div className="form-actions">
          <Submit label="Saqlash" icon={<Save className="lucide" />} />
        </div>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={formAction} className="panel" autoComplete="off">
      <header className="panel-head">
        <div>
          <h2>Parolni almashtirish</h2>
          <p>Yangi parol kamida 6 ta belgidan iborat bo&apos;lsin</p>
        </div>
      </header>
      <div className="panel-body">
        {state?.error && <div className="flash error">{state.error}</div>}
        {state?.ok && <div className="flash success">{state.message}</div>}
        <div className="form-grid">
          <div className="field wide">
            <label htmlFor="current">Joriy parol</label>
            <input
              id="current"
              type="password"
              name="current"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password1">Yangi parol</label>
            <input
              id="password1"
              type="password"
              name="password1"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password2">Yangi parolni takrorlang</label>
            <input
              id="password2"
              type="password"
              name="password2"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
        </div>
        <p className="pw-hint">
          Parol faqat raqamlardan iborat bo&apos;lmasin va login bilan bir xil bo&apos;lmasin.
        </p>
        <div className="form-actions">
          <Submit label="Parolni almashtirish" icon={<KeyRound className="lucide" />} />
        </div>
      </div>
    </form>
  );
}
