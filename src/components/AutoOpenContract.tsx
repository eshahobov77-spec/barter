'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useContractModal } from './ContractModal';

/** URL da ?open=<id> bo'lsa, shartnoma oynasini avtomatik ochadi. */
export default function AutoOpenContract() {
  const params = useSearchParams();
  const { open, openId } = useContractModal();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const raw = params.get('open');
    if (!raw) {
      // Parametr yo'qolgan — keyingi safar shu ID qaytadan ochilishi mumkin
      handled.current = null;
      return;
    }
    if (handled.current === raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return;
    handled.current = raw;
    if (openId !== id) open(id);
  }, [params, open, openId]);

  return null;
}
