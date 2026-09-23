'use client';

import { useState } from 'react';

function group(raw: string): string {
  const cleaned = raw.replace(/[^\d,.]/g, '');
  const parts = cleaned.split(/[,.]/);
  const intPart = parts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.length > 1 ? `${intPart},${parts[1].slice(0, 2)}` : intPart;
}

/** "1250000" -> "1 250 000" ko'rinishida yozadigan summa maydoni. */
export default function MoneyInput({
  name,
  id,
  defaultValue = '',
  required = false,
  placeholder,
  autoComplete = 'off',
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [value, setValue] = useState(() => group(String(defaultValue ?? '')));
  return (
    <input
      id={id}
      type="text"
      name={name}
      inputMode="decimal"
      autoComplete={autoComplete}
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(group(e.target.value))}
    />
  );
}
