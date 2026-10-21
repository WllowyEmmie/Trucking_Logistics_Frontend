// The public booking page: GET /book/geocode, POST /book/quote, POST /book, GET /book/{reference}.

import { api, post } from './api';

export interface BookingStop {
  stop_type: 'pickup' | 'dropoff';
  address: string;
  lat: number;
  lng: number;
  contact_name?: string | null;
  contact_phone?: string | null;
}

export interface Quote {
  distance_km: number;
  /** Naira. */
  amount: number;
  currency: string;
}

export interface BookingInput {
  name: string;
  email: string;
  phone: string;
  goods_desc: string | null;
  stops: BookingStop[];
  accept_terms: boolean;
}

export interface BookingMade extends Quote {
  reference: string;
  /** Paystack's payment page. */
  checkout_url: string;
}

export interface BookingStatus {
  reference: string;
  status: 'awaiting_payment' | 'paid' | 'failed';
  amount: number;
  currency: string;
  delivery_reference?: string;
  tracking_token?: string;
}

export const GEOCODE_PATH = '/book/geocode';
export const getQuote = (stops: Pick<BookingStop, 'lat' | 'lng' | 'stop_type'>[]) => post<Quote>('/book/quote', { stops });
export const makeBooking = (b: BookingInput) => post<BookingMade>('/book', b);
export const bookingStatus = (reference: string) => api<BookingStatus>(`/book/${encodeURIComponent(reference)}`);

/** ₦25,000 */
export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** A ready-made email to dispatch, for when online booking is off. */
export function requestMailto(email: string, company: string): string {
  const body = [
    `Hello ${company},`,
    '',
    'I would like to request a delivery.',
    '',
    'Pickup address:',
    'Drop-off address(es):',
    'What is being moved (and roughly how heavy):',
    'When:',
    'My name and phone number:',
  ].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent('Delivery request')}&body=${encodeURIComponent(body)}`;
}
