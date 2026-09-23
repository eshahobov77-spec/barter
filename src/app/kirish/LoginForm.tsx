'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type FormState } from '@/actions/auth';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary block" type="submit" style={{ marginTop: 6 }} disabled={pending}>
      {pending ? 'Tekshirilmoqda…' : 'Kirish'}
    </button>
  );
}

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <>
      {state?.error && <div className="flash error">{state.error}</div>}
      <form action={formAction} className="form-stack">
        <div className="field">
          <label htmlFor="id_username">Login</label>
          <input
            type="text"
            name="username"
            id="id_username"
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor="id_password">Parol</label>
          <input
            type="password"
            name="password"
            id="id_password"
            autoComplete="current-password"
            required
          />
        </div>
        <input type="hidden" name="next" value={next} />
        <Submit />
      </form>
    </>
  );
}
