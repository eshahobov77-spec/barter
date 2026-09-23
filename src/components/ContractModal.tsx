'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import ContractDetailView from './ContractDetailView';

type Ctx = { open: (id: number) => void; close: () => void; openId: number | null };
const ModalContext = createContext<Ctx>({ open: () => {}, close: () => {}, openId: null });

export function useContractModal() {
  return useContext(ModalContext);
}

export default function ContractModalProvider({
  children,
  initialOpenId = null,
}: {
  children: React.ReactNode;
  initialOpenId?: number | null;
}) {
  const [openId, setOpenId] = useState<number | null>(initialOpenId);
  const [detail, setDetail] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const dirty = useRef(false);
  const router = useRouter();

  const open = useCallback((id: number) => {
    setOpenId(id);
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
    setDetail(null);
    setLoadError('');
    if (dirty.current) {
      dirty.current = false;
      router.refresh();
    }
    // URL dagi ?open= ni tozalaymiz (router orqali — useSearchParams ham yangilanadi)
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('open')) {
        url.searchParams.delete('open');
        const qs = url.searchParams.toString();
        router.replace(qs ? `${url.pathname}?${qs}` : url.pathname, { scroll: false });
      }
    } catch {
      /* ignore */
    }
  }, [router]);

  const load = useCallback(async (id: number) => {
    setLoadError('');
    try {
      const resp = await fetch(`/api/contract/${id}`, { cache: 'no-store' });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setLoadError(body.error || "Ma'lumotni yuklab bo'lmadi.");
        setDetail(null);
        return;
      }
      setDetail(await resp.json());
    } catch {
      setLoadError("Ma'lumotni yuklab bo'lmadi. Sahifani yangilab, qayta urinib ko'ring.");
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    if (openId === null) return;
    setDetail(null);
    load(openId);
  }, [openId, load]);

  useEffect(() => {
    if (openId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [openId, close]);

  const onChanged = useCallback(() => {
    dirty.current = true;
    if (openId !== null) load(openId);
    router.refresh();
  }, [openId, load, router]);

  return (
    <ModalContext.Provider value={{ open, close, openId }}>
      {children}
      {openId !== null && (
        <div className="modal" id="modal">
          <button type="button" className="modal-backdrop" aria-label="Yopish" onClick={close} />
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Shartnoma">
            <button type="button" className="modal-x" aria-label="Yopish" onClick={close}>
              <X className="lucide" />
            </button>
            <div id="modal-body">
              {loadError ? (
                <div className="modal-loading">{loadError}</div>
              ) : !detail ? (
                <div className="modal-loading">Yuklanmoqda…</div>
              ) : (
                <ContractDetailView detail={detail} onChanged={onChanged} onOpenOther={open} />
              )}
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
