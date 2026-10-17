export type DealCategory =
  | 'flower'
  | 'vapes'
  | 'edibles'
  | 'prerolls'
  | 'concentrates';

export type DealStrength = 'steal' | 'strong' | 'fair';

export type MenuSource = 'Dutchie' | 'Jane' | 'Weedmaps' | 'Dispensary Feed' | 'CSV' | 'Seed';

export type PricePoint = {
  date: string;
  price: number;
};

export type Deal = {
  id: string;
  productName: string;
  brand: string;
  category: DealCategory;
  format: string;
  currentPrice: number;
  originalPrice?: number;
  lowestPrice?: number;
  averagePrice?: number;
  highestPrice?: number;
  savingsPct: number;
  thc?: string;
  pricePerUnit: string;
  dealText: string;
  description?: string;
  priceHistory?: PricePoint[];
  strength: DealStrength;
  expiresIn: string;
  verification: 'verified' | 'needs-check' | 'partner-feed' | 'public-index';
};

export type Dispensary = {
  id: string;
  name: string;
  city: string;
  county: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  openNow: boolean;
  updatedAt: string;
  dealCount: number;
  valueScore: number;
  averageSavings: number;
  menuSource: MenuSource;
  deals: Deal[];
};
