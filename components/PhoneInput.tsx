'use client';

import { PHONE_COUNTRIES, phoneCountry, type PhoneValue } from '@/lib/phone';

interface Props {
  id?: string;
  value: PhoneValue;
  onChange: (v: PhoneValue) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Console forms, or the driver app's larger fields. */
  size?: 'md' | 'lg';
  autoComplete?: string;
  /** Labels the pair for screen readers when there's no visible <label> for the number. */
  label?: string;
}

/**
 * A country code dropdown and the number beside it. The dropdown shows the calling code; its
 * options carry the country names. Parents keep {country, national} and send toE164() to the API.
 */
export function PhoneInput({ id, value, onChange, invalid, describedBy, size = 'md', autoComplete = 'tel-national', label = 'Phone number' }: Props) {
  const c = phoneCountry(value.country);
  const lg = size === 'lg';
  const border = invalid ? 'border-2 border-attention' : lg ? 'border-2 border-ink' : 'border border-border';
  const box = lg ? `min-h-16 rounded-lg ${border} text-[20px] font-medium` : `min-h-11 rounded-md ${border} text-[14px]`;
  return (
    <div role="group" aria-label={label} className="flex min-w-0 gap-2">
      <select
        aria-label="Country code"
        value={value.country}
        onChange={(e) => onChange({ ...value, country: e.target.value })}
        className={`${box} ${lg ? 'w-[9.5rem]' : 'w-[7.5rem]'} flex-none whitespace-nowrap bg-surface-100 ps-3 font-mono text-ink`}
      >
        {PHONE_COUNTRIES.map((x) => (
          <option key={x.iso} value={x.iso}>
            +{x.dial} {x.iso === c.iso ? x.iso : x.name}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        value={value.national}
        onChange={(e) => onChange({ ...value, national: e.target.value })}
        placeholder={c.iso === 'NG' ? '803 123 4567' : 'Number'}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${box} min-w-0 flex-1 bg-surface-100 px-3 font-mono text-ink`}
      />
    </div>
  );
}
