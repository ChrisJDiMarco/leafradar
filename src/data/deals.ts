import { Deal, DealCategory, Dispensary, PricePoint } from '../types/deals';
import { dutchieDispensaries, dutchieGeneratedAt } from './generated/dutchie';

export const categories: Array<{ key: 'all' | DealCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'flower', label: 'Flower' },
  { key: 'vapes', label: 'Vapes' },
  { key: 'edibles', label: 'Edibles' },
  { key: 'prerolls', label: 'Prerolls' },
  { key: 'concentrates', label: 'Concentrates' },
];

const mockDispensaries: Dispensary[] = [
  {
    id: 'garden-state-vineland',
    name: 'Garden State Supply',
    city: 'Vineland',
    county: 'Cumberland',
    latitude: 39.4862,
    longitude: -75.0257,
    distanceMiles: 38.4,
    openNow: true,
    updatedAt: '8:42 AM',
    dealCount: 18,
    valueScore: 94,
    averageSavings: 31,
    menuSource: 'Dutchie',
    deals: [
      {
        id: 'gss-flower-1',
        productName: 'Lemon Bar eighth',
        brand: 'Garden Greens',
        category: 'flower',
        format: '3.5g flower',
        currentPrice: 24,
        originalPrice: 42,
        lowestPrice: 24,
        averagePrice: 34,
        highestPrice: 44,
        savingsPct: 43,
        thc: '28%',
        pricePerUnit: '$6.86/g',
        dealText: 'Best eighth price in South Jersey today',
        description: 'Bright citrus flower deal with one of the lowest price-per-gram marks currently indexed.',
        priceHistory: [
          { date: 'Apr 15', price: 42 },
          { date: 'Apr 18', price: 40 },
          { date: 'Apr 21', price: 38 },
          { date: 'Apr 24', price: 39 },
          { date: 'Apr 27', price: 34 },
          { date: 'Apr 30', price: 32 },
          { date: 'May 3', price: 30 },
          { date: 'May 6', price: 29 },
          { date: 'May 9', price: 27 },
          { date: 'Today', price: 24 },
        ],
        strength: 'steal',
        expiresIn: 'today',
        verification: 'verified',
      },
      {
        id: 'gss-vape-1',
        productName: 'Live Resin Cart',
        brand: 'MPX',
        category: 'vapes',
        format: '0.5g cartridge',
        currentPrice: 35,
        originalPrice: 55,
        lowestPrice: 32,
        averagePrice: 46,
        highestPrice: 60,
        savingsPct: 36,
        thc: '82%',
        pricePerUnit: '$70/g',
        dealText: 'Cart price dropped below 30-day average',
        description: 'Live resin cartridge with a clean price drop signal against the last observed month.',
        priceHistory: [
          { date: 'Apr 15', price: 55 },
          { date: 'Apr 18', price: 52 },
          { date: 'Apr 21', price: 50 },
          { date: 'Apr 24', price: 51 },
          { date: 'Apr 27', price: 48 },
          { date: 'Apr 30', price: 44 },
          { date: 'May 3', price: 42 },
          { date: 'May 6', price: 39 },
          { date: 'May 9', price: 37 },
          { date: 'Today', price: 35 },
        ],
        strength: 'strong',
        expiresIn: '6 hours',
        verification: 'verified',
      },
    ],
  },
  {
    id: 'hudson-canna-jersey-city',
    name: 'Hudson Canna Co.',
    city: 'Jersey City',
    county: 'Hudson',
    latitude: 40.7178,
    longitude: -74.0431,
    distanceMiles: 5.2,
    openNow: true,
    updatedAt: '8:36 AM',
    dealCount: 27,
    valueScore: 88,
    averageSavings: 24,
    menuSource: 'Jane',
    deals: [
      {
        id: 'hcc-edible-1',
        productName: 'Fast-Acting Gummies',
        brand: 'Wana',
        category: 'edibles',
        format: '100mg pack',
        currentPrice: 18,
        originalPrice: 28,
        lowestPrice: 18,
        averagePrice: 24,
        highestPrice: 30,
        savingsPct: 36,
        thc: '100mg',
        pricePerUnit: '$0.18/mg',
        dealText: 'Lowest verified edible price within 10 miles',
        description: 'Fast-acting edible deal ranked by cost per milligram and proximity.',
        strength: 'strong',
        expiresIn: 'today',
        verification: 'verified',
      },
      {
        id: 'hcc-preroll-1',
        productName: 'Mini pre-roll multipack',
        brand: 'Dogwalkers',
        category: 'prerolls',
        format: '5-pack',
        currentPrice: 22,
        originalPrice: 34,
        lowestPrice: 22,
        averagePrice: 29,
        highestPrice: 36,
        savingsPct: 35,
        thc: '25%',
        pricePerUnit: '$4.40/roll',
        dealText: 'Best commuter pickup near PATH',
        description: 'Pre-roll multipack priced for a quick pickup near transit.',
        strength: 'strong',
        expiresIn: '11 hours',
        verification: 'verified',
      },
    ],
  },
  {
    id: 'shoreline-atlantic-city',
    name: 'Shoreline Botanics',
    city: 'Atlantic City',
    county: 'Atlantic',
    latitude: 39.3643,
    longitude: -74.4229,
    distanceMiles: 58.8,
    openNow: true,
    updatedAt: '8:29 AM',
    dealCount: 12,
    valueScore: 82,
    averageSavings: 21,
    menuSource: 'Weedmaps',
    deals: [
      {
        id: 'sb-ounce-1',
        productName: 'House Blend ounce',
        brand: 'Shoreline',
        category: 'flower',
        format: '28g flower',
        currentPrice: 108,
        originalPrice: 160,
        lowestPrice: 108,
        averagePrice: 137,
        highestPrice: 168,
        savingsPct: 33,
        thc: '21%',
        pricePerUnit: '$3.86/g',
        dealText: 'Cheapest ounce currently indexed',
        description: 'Bulk flower buy with the strongest statewide price-per-gram signal in the demo index.',
        strength: 'steal',
        expiresIn: '2 days',
        verification: 'needs-check',
      },
    ],
  },
  {
    id: 'green-bridge-new-brunswick',
    name: 'Green Bridge',
    city: 'New Brunswick',
    county: 'Middlesex',
    latitude: 40.4862,
    longitude: -74.4518,
    distanceMiles: 24.7,
    openNow: false,
    updatedAt: '8:18 AM',
    dealCount: 21,
    valueScore: 79,
    averageSavings: 19,
    menuSource: 'Dispensary Feed',
    deals: [
      {
        id: 'gb-concentrate-1',
        productName: 'Cold Cure Rosin',
        brand: 'Onyx',
        category: 'concentrates',
        format: '1g concentrate',
        currentPrice: 54,
        originalPrice: 70,
        lowestPrice: 52,
        averagePrice: 64,
        highestPrice: 74,
        savingsPct: 23,
        thc: '76%',
        pricePerUnit: '$54/g',
        dealText: 'Rare concentrate discount, verified by shop feed',
        description: 'Cold cure rosin deal with a moderate but uncommon concentrate discount.',
        strength: 'fair',
        expiresIn: 'tomorrow',
        verification: 'verified',
      },
      {
        id: 'gb-vape-1',
        productName: 'Distillate Cart',
        brand: 'Simply Herb',
        category: 'vapes',
        format: '1g cartridge',
        currentPrice: 44,
        originalPrice: 60,
        lowestPrice: 40,
        averagePrice: 52,
        highestPrice: 64,
        savingsPct: 27,
        thc: '86%',
        pricePerUnit: '$44/g',
        dealText: 'Best 1g cart value in central NJ',
        description: 'One-gram cart deal ranked by full-gram pricing and central Jersey availability.',
        strength: 'strong',
        expiresIn: 'today',
        verification: 'verified',
      },
    ],
  },
  {
    id: 'camden-crop-cherry-hill',
    name: 'Camden Crop House',
    city: 'Cherry Hill',
    county: 'Camden',
    latitude: 39.9268,
    longitude: -75.0246,
    distanceMiles: 47.1,
    openNow: true,
    updatedAt: '8:12 AM',
    dealCount: 15,
    valueScore: 86,
    averageSavings: 26,
    menuSource: 'Dutchie',
    deals: [
      {
        id: 'cch-preroll-1',
        productName: 'Infused pre-roll',
        brand: 'Crops',
        category: 'prerolls',
        format: '1g infused',
        currentPrice: 14,
        originalPrice: 24,
        lowestPrice: 14,
        averagePrice: 20,
        highestPrice: 26,
        savingsPct: 42,
        thc: '39%',
        pricePerUnit: '$14/roll',
        dealText: 'Highest savings rate on pre-rolls today',
        description: 'Infused pre-roll deal with the highest percentage discount in the current feed.',
        strength: 'steal',
        expiresIn: 'today',
        verification: 'verified',
      },
      {
        id: 'cch-flower-1',
        productName: 'Small Bud quarters',
        brand: 'Crops',
        category: 'flower',
        format: '7g flower',
        currentPrice: 48,
        originalPrice: 70,
        lowestPrice: 46,
        averagePrice: 61,
        highestPrice: 74,
        savingsPct: 31,
        thc: '23%',
        pricePerUnit: '$6.86/g',
        dealText: 'Solid weekly flower buy',
        description: 'Small-bud quarter that beats most eighth pricing when normalized by gram.',
        strength: 'strong',
        expiresIn: '3 days',
        verification: 'verified',
      },
    ],
  },
];

export const hasDutchieData = dutchieDispensaries.length > 0;

export const latestDataUpdatedAt = dutchieGeneratedAt;

export const dispensaries: Dispensary[] = hasDutchieData
  ? dutchieDispensaries
  : mockDispensaries;

export const indexDeals = (sourceDispensaries: Dispensary[]) => sourceDispensaries.flatMap((dispensary) =>
  dispensary.deals.map((deal) => ({
    ...deal,
    dispensaryId: dispensary.id,
    dispensaryName: dispensary.name,
    city: dispensary.city,
    distanceMiles: dispensary.distanceMiles,
    updatedAt: dispensary.updatedAt,
    valueScore: dispensary.valueScore,
    menuSource: dispensary.menuSource,
  })),
);

export const allDeals = indexDeals(dispensaries);

export type IndexedDeal = Deal & {
  dispensaryId: string;
  dispensaryName: string;
  city: string;
  distanceMiles: number;
  updatedAt: string;
  valueScore: number;
  menuSource: Dispensary['menuSource'];
};

export const getBestDeal = (dispensary: Dispensary) =>
  [...dispensary.deals].sort((a, b) => b.savingsPct - a.savingsPct)[0];

export const getPriceHistory = (deal: Deal): PricePoint[] => {
  if (deal.priceHistory?.length) {
    return deal.priceHistory;
  }

  const high = deal.highestPrice || deal.originalPrice || Math.round(deal.currentPrice * 1.35);
  const low = deal.lowestPrice || Math.min(deal.currentPrice, Math.round(high * 0.72));
  const current = deal.currentPrice;
  const prices = [
    high,
    Math.round(high * 0.94),
    Math.round(high * 0.9),
    Math.round(high * 0.92),
    Math.round((high + low) / 2),
    Math.round((current + high) / 2),
    Math.round(current * 1.12),
    Math.round(current * 1.06),
    Math.round(current * 1.02),
    current,
  ];

  return ['Apr 15', 'Apr 18', 'Apr 21', 'Apr 24', 'Apr 27', 'Apr 30', 'May 3', 'May 6', 'May 9', 'Today'].map(
    (date, index) => ({
      date,
      price: prices[index],
    }),
  );
};

export const getPriceStats = (deal: Deal) => {
  const history = getPriceHistory(deal);
  const prices = history.map((point) => point.price);
  const lowest = deal.lowestPrice || Math.min(...prices);
  const highest = deal.highestPrice || Math.max(...prices);
  const average =
    deal.averagePrice || Math.round(prices.reduce((total, price) => total + price, 0) / prices.length);

  return { average, highest, lowest };
};
