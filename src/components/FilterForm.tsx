'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useRef } from 'react';

/**
 * Filtr formasi: select/date/checkbox o'zgarganda darhol,
 * matn maydonida Enter bosilganda yuboriladi.
 */
export default function FilterForm({
  action,
  className = 'panel filters',
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const ref = useRef<HTMLFormElement>(null);
  // URL o'zgarganda formani qayta qurish — aks holda <select defaultValue> eski
  // tanlovda qolib ketadi (orqaga qaytish, dashboarddan kelgan havolalar va h.k.)
  const formKey = params.toString();

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of fd.entries()) {
      const v = String(value).trim();
      if (v && key !== 'page') params.set(key, v);
    }
    const qs = params.toString();
    router.push(qs ? `${action}?${qs}` : action);
  }

  return (
    <form
      key={formKey}
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        if (target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'search')) return;
        if (ref.current) submit(ref.current);
      }}
    >
      {children}
    </form>
  );
}
