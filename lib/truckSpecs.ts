'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL, api, del } from './api';

// What each truck is (Go: internal/api/truck_specs.go) and its photo. Trucks without their own
// photo show a stock photo for their body type: free-licence pictures on Wikimedia Commons, shown
// from there with the credit their licence asks for.

export type BodyType = 'box' | 'dropside' | 'flatbed' | 'tipper' | 'tanker' | 'refrigerated' | 'curtainsider' | 'tractor';
export type Fuel = 'diesel' | 'petrol' | 'cng' | 'lng' | 'electric' | 'hybrid';

export interface TruckSpecs {
  truck_id: string;
  body_type: BodyType | null;
  capacity_kg: number | null;
  body_length_m: number | null;
  pallets: number | null;
  year: number | null;
  fuel: Fuel | null;
  has_photo: boolean;
  photo_updated_at: string | null;
}

export const TRUCK_SPECS_KEY = ['truck-specs'] as const;

export function useTruckSpecs() {
  return useQuery({ queryKey: TRUCK_SPECS_KEY, queryFn: () => api<TruckSpecs[]>('/trucks/specs'), staleTime: 60_000 });
}

export const BODY_LABEL: Record<BodyType, string> = {
  box: 'Box truck',
  dropside: 'Dropside',
  flatbed: 'Flatbed',
  tipper: 'Tipper',
  tanker: 'Tanker',
  refrigerated: 'Refrigerated',
  curtainsider: 'Curtainsider',
  tractor: 'Tractor unit',
};

export const FUEL_LABEL: Record<Fuel, string> = { diesel: 'Diesel', petrol: 'Petrol', cng: 'CNG', lng: 'LNG', electric: 'Electric', hybrid: 'Hybrid' };

interface Stock {
  url: string;
  credit: string;
  license: string;
  page: string;
}

const C = 'https://thumb.wikimedia.org/wikipedia/commons/thumb';
const STOCK_BOX: Stock = {
  url: `${C}/e/e1/Isuzu_NPR_box_truck_in_red_%28TR%29.jpg/1920px-Isuzu_NPR_box_truck_in_red_%28TR%29.jpg`,
  credit: 'Mr.choppers',
  license: 'CC BY-SA 3.0',
  page: 'https://commons.wikimedia.org/wiki/File:Isuzu_NPR_box_truck_in_red_(TR).jpg',
};
const STOCK_DROPSIDE: Stock = {
  url: `${C}/2/2d/Isuzu_Elf_NPR_Dropside_Cargo_Truck_2019.jpg/1920px-Isuzu_Elf_NPR_Dropside_Cargo_Truck_2019.jpg`,
  credit: 'Captainmorlypogi1959',
  license: 'CC BY-SA 4.0',
  page: 'https://commons.wikimedia.org/wiki/File:Isuzu_Elf_NPR_Dropside_Cargo_Truck_2019.jpg',
};
const STOCK_TRACTOR: Stock = {
  url: `${C}/8/8c/6-365_Volvo_FH.jpg/1920px-6-365_Volvo_FH.jpg`,
  credit: 'dickinsonjohn02',
  license: 'Public domain',
  page: 'https://commons.wikimedia.org/wiki/File:6-365_Volvo_FH.jpg',
};

export const STOCK: Record<BodyType, Stock> = {
  box: STOCK_BOX,
  dropside: STOCK_DROPSIDE,
  flatbed: STOCK_DROPSIDE,
  tipper: {
    url: `${C}/e/ec/W._J._Balsdon_%26_Sons_tipper%2C_Teignmouth%2C_23_March_2012.jpg/1920px-W._J._Balsdon_%26_Sons_tipper%2C_Teignmouth%2C_23_March_2012.jpg`,
    credit: 'Barry Lewis',
    license: 'CC BY 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:W._J._Balsdon_%26_Sons_tipper,_Teignmouth,_23_March_2012.jpg',
  },
  tanker: {
    url: `${C}/8/88/Water_Tanker_Truck_20%2C_US_Air_Force_%28cropped%29.jpg/1920px-Water_Tanker_Truck_20%2C_US_Air_Force_%28cropped%29.jpg`,
    credit: 'Walter',
    license: 'CC BY 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Water_Tanker_Truck_20,_US_Air_Force_(cropped).jpg',
  },
  refrigerated: {
    url: `${C}/a/a9/Fortune_HS_Leasing_RCB-7036_right_side_20210131.jpg/1920px-Fortune_HS_Leasing_RCB-7036_right_side_20210131.jpg`,
    credit: 'Solomon203',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Fortune_HS_Leasing_RCB-7036_right_side_20210131.jpg',
  },
  curtainsider: STOCK_TRACTOR,
  tractor: STOCK_TRACTOR,
};

/** The truck's own photo when it has one, else the stock photo for its body type (box by default). */
export function truckPicture(id: string, s: TruckSpecs | undefined): { url: string; stock: Stock | null } {
  if (s?.has_photo) return { url: `${API_URL}/trucks/${encodeURIComponent(id)}/photo?v=${encodeURIComponent(s.photo_updated_at ?? '')}`, stock: null };
  const st = STOCK[s?.body_type ?? 'box'];
  return { url: st.url, stock: st };
}

/** A picked file as a JPEG data URL, at most 1800 px wide (keeps uploads well under the 3 MB limit). */
export async function photoDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export const putTruckSpecs = (id: string, body: Omit<TruckSpecs, 'truck_id' | 'has_photo' | 'photo_updated_at'>) =>
  api<TruckSpecs>(`/trucks/${encodeURIComponent(id)}/specs`, { method: 'PUT', body: JSON.stringify(body) });
export const putTruckPhoto = (id: string, photo: string) =>
  api<{ has_photo: boolean }>(`/trucks/${encodeURIComponent(id)}/photo`, { method: 'PUT', body: JSON.stringify({ photo }) });
export const deleteTruckPhoto = (id: string) => del(`/trucks/${encodeURIComponent(id)}/photo`);
