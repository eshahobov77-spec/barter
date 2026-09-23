'use client';

import { useFormStatus } from 'react-dom';

/** Tasdiqlash so'rab, server action'ni bajaradigan forma. */
export default function ConfirmForm({
  action,
  message,
  className,
  style,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action as any}
      className={className}
      style={style}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

export function SubmitButton({
  className = 'btn btn-primary',
  children,
  title,
  ariaLabel,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
