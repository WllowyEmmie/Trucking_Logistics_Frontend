'use client';

import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AddressFinder } from '@/components/console/AddressFinder';
import { inputCls, textareaCls } from '@/components/console/ui';
import { PhoneInput } from '@/components/PhoneInput';
import { SiteShell } from '@/components/site/SiteChrome';
import { telHref } from '@/components/tracking/TrackingPhone';
import { ApiError } from '@/lib/api';
import { GEOCODE_PATH, getQuote, makeBooking, naira, requestMailto, type BookingStop, type Quote } from '@/lib/booking';
import { useConfig } from '@/lib/config';
import { prettyPhone, useSite } from '@/lib/site';
import { defaultPhoneCountry, emptyPhone, phoneProblem, toE164, type PhoneValue } from '@/lib/phone';

// The public booking form: route, contact, price, then Paystack. Nothing is booked until it's paid;
// the server prices it again and checks everything, so this page only helps people get it right.

const MAX_DROPS = 5;

interface StopDraft {
  key: number;
  address: string;
  lat: number | null;
  lng: number | null;
  contactName: string;
  contactPhone: PhoneValue;
}

let nextKey = 1;
const blankStop = (country: string): StopDraft => ({ key: nextKey++, address: '', lat: null, lng: null, contactName: '', contactPhone: emptyPhone(country) });

type QuoteState = { kind: 'none' } | { kind: 'loading' } | { kind: 'ok'; q: Quote } | { kind: 'error'; message: string };

export default function BookPage() {
  const c = useConfig();
  const site = useSite();
  const home = c.country || defaultPhoneCountry(c);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState<PhoneValue>(() => emptyPhone(home));
  const [goods, setGoods] = useState('');
  const [stops, setStops] = useState<StopDraft[]>(() => [blankStop(home), blankStop(home)]);
  const [terms, setTerms] = useState(false);
  const [quote, setQuote] = useState<QuoteState>({ kind: 'none' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Price as soon as every stop has a place, and again when one changes.
  const placed = stops.every((s) => s.lat != null && s.lng != null);
  const routeKey = stops.map((s) => `${s.lat},${s.lng}`).join('|');
  const seq = useRef(0);
  useEffect(() => {
    if (!placed) {
      setQuote({ kind: 'none' });
      return;
    }
    const mine = ++seq.current;
    setQuote({ kind: 'loading' });
    const t = setTimeout(() => {
      getQuote(stops.map((s, i) => ({ stop_type: i === 0 ? 'pickup' : 'dropoff', lat: s.lat!, lng: s.lng! })))
        .then((q) => mine === seq.current && setQuote({ kind: 'ok', q }))
        .catch((e) => mine === seq.current && setQuote({ kind: 'error', message: e instanceof ApiError ? e.message : 'Couldn’t work out a price.' }));
    }, 300);
    return () => clearTimeout(t);
    // routeKey stands for the coordinates; the stops array changes on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, placed]);

  const setStop = (key: number, p: Partial<StopDraft>) => setStops((ss) => ss.map((s) => (s.key === key ? { ...s, ...p } : s)));

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Your name';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'An email address, for your receipt';
    const pp = phoneProblem(phone, true);
    if (pp) e.phone = pp;
    stops.forEach((s, i) => {
      if (s.lat == null || s.lng == null) e[`stop${s.key}`] = i === 0 ? 'Find the pickup address and pick a match' : 'Find the address and pick a match';
      const cp = phoneProblem(s.contactPhone, false);
      if (cp) e[`phone${s.key}`] = cp;
    });
    if (!terms) e.terms = 'Please read and accept the delivery terms';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) return;
    const body: BookingStop[] = stops.map((s, i) => ({
      stop_type: i === 0 ? 'pickup' : 'dropoff',
      address: s.address.trim(),
      lat: s.lat!,
      lng: s.lng!,
      contact_name: s.contactName.trim() || null,
      contact_phone: s.contactPhone.national.trim() ? toE164(s.contactPhone) : null,
    }));
    setSending(true);
    try {
      const made = await makeBooking({
        name: name.trim(),
        email: email.trim(),
        phone: toE164(phone),
        goods_desc: goods.trim() || null,
        stops: body,
        accept_terms: terms,
      });
      // Off to Paystack; it brings the customer back to /book/done.
      window.location.assign(made.checkout_url);
    } catch (err) {
      setSending(false);
      setFailure(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (!c.booking_enabled) {
    return (
      <SiteShell>
        <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-16">
          <h1 className="t-display m-0">Request a delivery</h1>
          <p className="t-body m-0 text-ink-muted">
            Online booking isn&apos;t open yet. Send dispatch your pickup, drop-offs and what&apos;s being moved, and they&apos;ll reply with a price.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={requestMailto(site.email, site.name)} className="inline-flex min-h-12 items-center rounded-md bg-ink px-5 text-[15px] font-semibold text-surface-100 no-underline">
              Email {site.email}
            </a>
            <a href={telHref(site.phone)} className="inline-flex min-h-12 items-center rounded-md border border-border px-5 text-[15px] font-semibold text-ink no-underline">
              Call {prettyPhone(site.phone)}
            </a>
          </div>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main className="mx-auto grid w-full max-w-[1120px] gap-8 px-4 py-10 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="t-display m-0">Request a delivery</h1>
            <p className="t-body m-0 text-ink-muted">One pickup, up to {MAX_DROPS} drop-offs. You see the price before you pay.</p>
          </div>

          <Group title="Route">
            {stops.map((s, i) => (
              <div key={s.key} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="t-label text-ink-muted">{i === 0 ? 'Pickup' : `Drop-off ${i}`}</span>
                  {i > 1 && (
                    <button
                      type="button"
                      onClick={() => setStops((ss) => ss.filter((x) => x.key !== s.key))}
                      aria-label={`Remove drop-off ${i}`}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-100 text-ink"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <Field label="Address" error={errors[`stop${s.key}`]} htmlFor={`addr${s.key}`}>
                  <AddressFinder
                    id={`addr${s.key}`}
                    value={s.address}
                    invalid={!!errors[`stop${s.key}`]}
                    searchPath={GEOCODE_PATH}
                    onChange={(address) => setStop(s.key, { address, lat: null, lng: null })}
                    onPick={(p) => setStop(s.key, { address: p.label, lat: p.lat, lng: p.lng })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={i === 0 ? 'Contact at pickup (optional)' : 'Who receives it (optional)'} htmlFor={`cn${s.key}`}>
                    <input id={`cn${s.key}`} value={s.contactName} maxLength={120} onChange={(e) => setStop(s.key, { contactName: e.target.value })} className={`${inputCls()} w-full`} />
                  </Field>
                  <Field label="Their phone (optional)" error={errors[`phone${s.key}`]}>
                    <PhoneInput id={`cp${s.key}`} value={s.contactPhone} onChange={(v) => setStop(s.key, { contactPhone: v })} invalid={!!errors[`phone${s.key}`]} label="Their phone" />
                  </Field>
                </div>
              </div>
            ))}
            {stops.length - 1 < MAX_DROPS && (
              <button
                type="button"
                onClick={() => setStops((ss) => [...ss, blankStop(home)])}
                className="inline-flex min-h-11 items-center gap-2 self-start rounded-md border border-border bg-surface-100 px-3.5 text-[14px] font-semibold text-ink"
              >
                <Plus size={16} aria-hidden="true" /> Add a drop-off
              </button>
            )}
          </Group>

          <Group title="What's being moved">
            <Field label="Goods (optional)" htmlFor="goods">
              <textarea id="goods" rows={3} maxLength={500} value={goods} onChange={(e) => setGoods(e.target.value)} placeholder="e.g. 40 bags of cement, about 2 tonnes" className={`${textareaCls()} w-full`} />
            </Field>
          </Group>

          <Group title="Your details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your name" error={errors.name} htmlFor="name">
                <input id="name" autoComplete="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={`${inputCls(!!errors.name)} w-full`} />
              </Field>
              <Field label="Email" error={errors.email} htmlFor="email">
                <input id="email" type="email" autoComplete="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} className={`${inputCls(!!errors.email)} w-full`} />
              </Field>
            </div>
            <Field label="Phone" error={errors.phone}>
              <PhoneInput id="phone" value={phone} onChange={setPhone} invalid={!!errors.phone} autoComplete="tel-national" />
            </Field>
          </Group>

          <label className="flex items-start gap-3">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-[var(--ink)]" />
            <span className="t-body">
              I&apos;ve read and accept the{' '}
              <Link href="/terms" target="_blank" className="font-semibold text-ink underline">
                delivery terms
              </Link>
              .{errors.terms && <span className="t-body-sm block font-semibold text-attention">{errors.terms}</span>}
            </span>
          </label>

          {failure && (
            <div role="alert" className="t-body rounded-md border border-status-failed bg-status-failed-bg px-4 py-3">
              {failure}
            </div>
          )}

          <div className="lg:hidden">
            <PriceCard quote={quote} sending={sending} />
          </div>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <PriceCard quote={quote} sending={sending} onPay={() => (document.querySelector('form') as HTMLFormElement | null)?.requestSubmit()} />
          </div>
        </aside>
      </main>
    </SiteShell>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="t-h1 m-0">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="t-body-sm font-semibold">
        {label}
      </label>
      {children}
      {error && <span className="t-body-sm font-semibold text-attention">{error}</span>}
    </div>
  );
}

/** The price, and the pay button. In the form on phones (submits it); beside it on wide screens. */
function PriceCard({ quote, sending, onPay }: { quote: QuoteState; sending: boolean; onPay?: () => void }) {
  const amount = quote.kind === 'ok' ? quote.q.amount : null;
  return (
    <div className="flex flex-col gap-4 rounded-lg border-2 border-ink p-5">
      <span className="t-label text-ink-muted">Your price</span>
      {quote.kind === 'ok' ? (
        <>
          <span className="text-[40px] leading-[44px] font-bold tracking-[-1px]">{naira(quote.q.amount)}</span>
          <span className="t-body-sm text-ink-muted">About {quote.q.distance_km.toLocaleString('en-NG')} km by road through all stops. Nothing is added later.</span>
        </>
      ) : quote.kind === 'loading' ? (
        <span className="t-body text-ink-muted">Working it out…</span>
      ) : quote.kind === 'error' ? (
        <span className="t-body font-semibold text-attention">{quote.message}</span>
      ) : (
        <span className="t-body text-ink-muted">Find the pickup and drop-off addresses to see the price.</span>
      )}
      <button
        type={onPay ? 'button' : 'submit'}
        onClick={onPay}
        disabled={sending || amount == null}
        className="min-h-12 rounded-md border-0 bg-ink px-4 text-[15px] font-semibold text-surface-100 disabled:opacity-45"
      >
        {sending ? 'Opening Paystack…' : amount != null ? `Pay ${naira(amount)} with Paystack` : 'Pay with Paystack'}
      </button>
      <span className="t-body-sm text-ink-muted">You&apos;ll pay on Paystack&apos;s secure page, then come straight back here.</span>
    </div>
  );
}
