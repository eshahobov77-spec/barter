'use client';

import { useContractModal } from './ContractModal';

/** Jadval qatori — bosilganda shartnoma oynasini ochadi. */
export function ContractRow({
  id,
  className = '',
  children,
}: {
  id: number;
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useContractModal();
  return (
    <tr
      className={`clickable ${className}`.trim()}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('a, button, form, input, select, label')) return;
        open(id);
      }}
    >
      {children}
    </tr>
  );
}

/** Feed elementi (<li>) */
export function ContractFeedItem({
  id,
  className = '',
  children,
}: {
  id: number;
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useContractModal();
  return (
    <li
      className={`clickable ${className}`.trim()}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('a, button, form, input, select, label')) return;
        open(id);
      }}
    >
      {children}
    </li>
  );
}

/** Oddiy tugma */
export function ContractButton({
  id,
  className = '',
  title,
  children,
}: {
  id: number;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const { open } = useContractModal();
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        open(id);
      }}
    >
      {children}
    </button>
  );
}
