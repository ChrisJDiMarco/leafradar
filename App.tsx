import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Flame,
  Heart,
  Home,
  MapPin,
  MapPinned,
  Plus,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import {
  categories,
  dispensaries as fallbackDispensaries,
  getBestDeal,
  getPriceHistory,
  getPriceStats,
  hasDutchieData,
  indexDeals,
  IndexedDeal,
  latestDataUpdatedAt,
} from './src/data/deals';
import { DealCategory, Dispensary } from './src/types/deals';

declare const process: { env?: Record<string, string | undefined> };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type AppTab = 'home' | 'map' | 'alerts' | 'saved' | 'profile';
type CategoryFilter = 'all' | DealCategory;
type SortMode = 'best' | 'cheapest' | 'nearest' | 'drop' | 'verified';

type SmartAlert = {
  active: boolean;
  brand?: string;
  category?: DealCategory;
  id: string;
  label: string;
  maxPrice?: number;
  radiusMiles?: number;
  region?: string;
};

type AlertMatch = SmartAlert & {
  matchCount: number;
  topDeals: IndexedDeal[];
};

type ShopperSettings = {
  mode: 'Adult-use deals' | 'Medical-friendly deals';
  openNowOnly: boolean;
  radiusMiles: number;
  region: 'NJ' | 'North Jersey' | 'Central Jersey' | 'South Jersey';
  sortMode: SortMode;
  verifiedOnly: boolean;
};

const currency = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const STORAGE_KEYS = {
  ageConfirmed: 'leafradar.ageConfirmed',
  savedDealIds: 'leafradar.savedDealIds',
  shopperSettings: 'leafradar.shopperSettings',
  smartAlerts: 'leafradar.smartAlerts',
};

const strengthColors = {
  fair: '#F3C969',
  steal: '#67F38F',
  strong: '#92E8A8',
};

const sortLabels: Record<SortMode, string> = {
  best: 'Best value',
  cheapest: 'Cheapest',
  drop: 'Biggest drop',
  nearest: 'Nearest',
  verified: 'Verified',
};

const navItems: Array<{ key: AppTab; label: string; Icon: typeof Home }> = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'map', label: 'Map', Icon: MapPinned },
  { key: 'alerts', label: 'Alerts', Icon: Bell },
  { key: 'saved', label: 'Saved', Icon: Bookmark },
  { key: 'profile', label: 'Profile', Icon: Settings },
];

const quickFilters: Array<{
  label: string;
  category: CategoryFilter;
  query: string;
}> = [
  { label: 'Cheapest ounce', category: 'flower', query: 'ounce' },
  { label: '$20 carts', category: 'vapes', query: 'cart' },
  { label: 'Best indica deals', category: 'all', query: 'indica' },
  { label: 'Price drops', category: 'all', query: 'price drop' },
];

const defaultSmartAlerts: SmartAlert[] = [
  { active: true, category: 'flower', id: 'ounces-under-120', label: 'Ounces under $120', maxPrice: 120, region: 'NJ' },
  { active: true, category: 'vapes', id: 'carts-under-25', label: 'Carts under $25', maxPrice: 25, radiusMiles: 15 },
  { active: true, brand: 'Cookies', category: 'vapes', id: 'cookies-carts-under-40', label: 'Cookies carts under $40', maxPrice: 40 },
  { active: true, category: 'edibles', id: 'bogo-edibles', label: 'BOGO edibles' },
  { active: true, category: 'flower', id: 'south-jersey-flower', label: 'South Jersey Flower Deals', region: 'South Jersey' },
];

const defaultShopperSettings: ShopperSettings = {
  mode: 'Adult-use deals',
  openNowOnly: false,
  radiusMiles: 60,
  region: 'NJ',
  sortMode: 'best',
  verifiedOnly: false,
};

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [runtimeDispensaries, setRuntimeDispensaries] = useState<Dispensary[]>(fallbackDispensaries);
  const [runtimeUpdatedAt, setRuntimeUpdatedAt] = useState<string | null>(latestDataUpdatedAt);
  const [dataSourceLabel, setDataSourceLabel] = useState(hasDutchieData ? 'Dutchie sync' : 'Live mock');
  const [selectedDispensary, setSelectedDispensary] = useState<Dispensary | null>(fallbackDispensaries[0]);
  const [sheetDispensary, setSheetDispensary] = useState<Dispensary | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<IndexedDeal | null>(null);
  const [savedDealIds, setSavedDealIds] = useState<string[]>(['gss-flower-1']);
  const [smartAlerts, setSmartAlerts] = useState<SmartAlert[]>(defaultSmartAlerts);
  const [alertMatches, setAlertMatches] = useState<AlertMatch[]>([]);
  const [shopperSettings, setShopperSettings] = useState<ShopperSettings>(defaultShopperSettings);
  const [alertBuilderVisible, setAlertBuilderVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<'denied' | 'enabled' | 'error' | 'idle' | 'simulator'>('idle');
  const allDeals = useMemo(() => indexDeals(runtimeDispensaries), [runtimeDispensaries]);

  const fetchRuntimeData = useCallback(async (showLoading = false) => {
    const apiRoot = getApiRoot();

    if (!apiRoot) {
      setIsRefreshing(false);
      return;
    }

    if (showLoading) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch(`${apiRoot}/api/bootstrap`);

      if (!response.ok) {
        throw new Error(`LeafRadar API returned ${response.status}`);
      }

      const payload = (await response.json()) as {
        dispensaries?: Dispensary[];
        source?: string;
        updatedAt?: string;
      };

      if (payload.dispensaries?.length) {
        setRuntimeDispensaries(payload.dispensaries);
        setRuntimeUpdatedAt(payload.updatedAt || null);
        setDataSourceLabel(payload.source || 'Local API');
        setSelectedDispensary(payload.dispensaries[0]);
        setLastFetchError(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown API error';
      setLastFetchError(message);
      console.warn(`LeafRadar API unavailable; using bundled data. ${message}`);
    }

    try {
      const response = await fetch(`${apiRoot}/api/alerts`);

      if (!response.ok) {
        throw new Error(`LeafRadar alerts returned ${response.status}`);
      }

      const payload = (await response.json()) as { alerts?: SmartAlert[] };

      if (payload.alerts?.length) {
        setSmartAlerts((current) => mergeSmartAlerts(payload.alerts || [], current));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown alerts error';
      console.warn(`LeafRadar alerts unavailable; using bundled alerts. ${message}`);
    }

    try {
      const response = await fetch(`${apiRoot}/api/alert-matches`);

      if (!response.ok) {
        throw new Error(`LeafRadar alert matches returned ${response.status}`);
      }

      const payload = (await response.json()) as { matches?: AlertMatch[] };
      setAlertMatches(payload.matches || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown alert match error';
      console.warn(`LeafRadar alert matches unavailable. ${message}`);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      readStorage<boolean>(STORAGE_KEYS.ageConfirmed),
      readStorage<string[]>(STORAGE_KEYS.savedDealIds),
      readStorage<SmartAlert[]>(STORAGE_KEYS.smartAlerts),
      readStorage<Partial<ShopperSettings>>(STORAGE_KEYS.shopperSettings),
    ])
      .then(([storedAgeConfirmed, storedSavedDealIds, storedSmartAlerts, storedSettings]) => {
        if (cancelled) {
          return;
        }

        if (typeof storedAgeConfirmed === 'boolean') {
          setAgeConfirmed(storedAgeConfirmed);
        }

        if (Array.isArray(storedSavedDealIds)) {
          setSavedDealIds(storedSavedDealIds);
        }

        if (Array.isArray(storedSmartAlerts)) {
          setSmartAlerts(mergeSmartAlerts(defaultSmartAlerts, storedSmartAlerts));
        }

        if (storedSettings) {
          setShopperSettings((current) => ({
            ...current,
            ...storedSettings,
          }));
        }

        setHydrated(true);
      })
      .catch((error) => {
        console.warn(`LeafRadar local storage unavailable. ${error.message}`);
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetchRuntimeData(false);
  }, [fetchRuntimeData]);

  useEffect(() => {
    if (hydrated) {
      void writeStorage(STORAGE_KEYS.ageConfirmed, ageConfirmed);
    }
  }, [ageConfirmed, hydrated]);

  useEffect(() => {
    if (hydrated) {
      void writeStorage(STORAGE_KEYS.savedDealIds, savedDealIds);
    }
  }, [hydrated, savedDealIds]);

  useEffect(() => {
    if (hydrated) {
      void writeStorage(STORAGE_KEYS.smartAlerts, smartAlerts);
    }
  }, [hydrated, smartAlerts]);

  useEffect(() => {
    if (hydrated) {
      void writeStorage(STORAGE_KEYS.shopperSettings, shopperSettings);
    }
  }, [hydrated, shopperSettings]);

  const filteredDeals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const dispensaryById = new Map(runtimeDispensaries.map((dispensary) => [dispensary.id, dispensary]));

    return allDeals
      .filter((deal) => activeCategory === 'all' || deal.category === activeCategory)
      .filter((deal) => shopperSettings.radiusMiles <= 0 || deal.distanceMiles <= shopperSettings.radiusMiles)
      .filter((deal) => {
        if (!shopperSettings.openNowOnly) {
          return true;
        }

        return dispensaryById.get(deal.dispensaryId)?.openNow !== false;
      })
      .filter((deal) => {
        if (!shopperSettings.verifiedOnly) {
          return true;
        }

        return deal.verification === 'verified' || deal.verification === 'partner-feed';
      })
      .filter((deal) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          deal.productName,
          deal.brand,
          deal.dispensaryName,
          deal.city,
          deal.dealText,
          deal.format,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => sortDeals(a, b, shopperSettings.sortMode));
  }, [activeCategory, allDeals, query, runtimeDispensaries, shopperSettings]);

  const savedDeals = useMemo(
    () => allDeals.filter((deal) => savedDealIds.includes(deal.id)),
    [allDeals, savedDealIds],
  );
  const visibleAlertMatches = useMemo(() => {
    const localMatches = buildClientAlertMatches(smartAlerts, allDeals);

    return localMatches.length ? localMatches : alertMatches;
  }, [alertMatches, allDeals, smartAlerts]);

  const scannedMenus = runtimeDispensaries.length;
  const totalDeals = allDeals.length;
  const averageSavings = allDeals.length
    ? Math.round(allDeals.reduce((total, deal) => total + deal.savingsPct, 0) / allDeals.length)
    : 0;
  const savedSavings = savedDeals.reduce(
    (total, deal) => total + Math.max((deal.originalPrice || deal.currentPrice) - deal.currentPrice, 0),
    0,
  );

  const toggleSavedDeal = (dealId: string) => {
    setSavedDealIds((current) =>
      current.includes(dealId)
        ? current.filter((currentId) => currentId !== dealId)
        : [...current, dealId],
    );
  };

  const updateShopperSettings = (patch: Partial<ShopperSettings>) => {
    setShopperSettings((current) => ({
      ...current,
      ...patch,
    }));
  };

  const createSmartAlert = async (alert: SmartAlert) => {
    let nextAlert = alert;

    try {
      const payload = await postJson<{ alert: SmartAlert }>('/api/alerts', alert);
      nextAlert = payload.alert;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown alert create error';
      console.warn(`LeafRadar alert create failed; keeping alert local. ${message}`);
    }

    setSmartAlerts((current) => mergeSmartAlerts(current, [nextAlert]));
    setAlertBuilderVisible(false);
    setActiveTab('alerts');
    void registerForPushNotifications(setPushStatus);
  };

  const toggleSmartAlert = (alertId: string) => {
    const target = smartAlerts.find((alert) => alert.id === alertId);
    const nextActive = !(target?.active ?? true);

    setSmartAlerts((current) =>
      current.map((alert) =>
        alert.id === alertId
          ? {
              ...alert,
              active: nextActive,
            }
          : alert,
      ),
    );

    void patchJson<{ alert: SmartAlert }>(`/api/alerts/${encodeURIComponent(alertId)}`, {
      active: nextActive,
    })
      .then((payload) => {
        setSmartAlerts((current) => mergeSmartAlerts(current, [payload.alert]));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown alert update error';
        console.warn(`LeafRadar alert update failed; keeping local state. ${message}`);
      });
  };

  if (!hydrated) {
    return (
      <SafeAreaProvider>
        <BootScreen />
      </SafeAreaProvider>
    );
  }

  if (!ageConfirmed) {
    return (
      <SafeAreaProvider>
        <AgeGate onConfirm={() => setAgeConfirmed(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <LinearGradient colors={['#111713', '#17221B', '#101411']} style={styles.app}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <ScrollView
            key={activeTab}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                onRefresh={() => void fetchRuntimeData(true)}
                refreshing={isRefreshing}
                tintColor="#67F38F"
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.logoMark}>
                <Radar color="#67F38F" size={24} strokeWidth={2.4} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>NJ price radar</Text>
                <Text style={styles.appTitle}>LeafRadar</Text>
              </View>
              <View style={styles.updatedPill}>
                <Clock3 color="#DDE7D8" size={14} />
                <Text style={styles.updatedText}>{runtimeUpdatedAt || '8:42 AM'}</Text>
              </View>
            </View>

            {(activeTab === 'home' || activeTab === 'map') && (
              <>
                <View style={styles.statsGrid}>
                  <MetricCard label="Menus" value={String(scannedMenus)} tone="green" />
                  <MetricCard label="Deals" value={String(totalDeals)} tone="amber" />
                  <MetricCard label="Avg save" value={`${averageSavings}%`} tone="blue" />
                </View>

                <View style={styles.searchRow}>
                  <Search color="#AEB9AD" size={19} />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setQuery}
                    placeholder="Cheapest carts, ounces, edibles..."
                    placeholderTextColor="#8E9B8C"
                    style={styles.searchInput}
                    value={query}
                  />
                  {query.length > 0 && (
                    <Pressable
                      accessibilityLabel="Clear search"
                      onPress={() => setQuery('')}
                      style={styles.searchIconButton}
                    >
                      <X color="#AEB9AD" size={17} />
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityLabel="Open deal filters"
                    onPress={() => setFilterSheetVisible(true)}
                    style={styles.searchIconButton}
                  >
                    <SlidersHorizontal color="#E9F5E6" size={19} />
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={styles.categoryRail}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {categories.map((category) => {
                    const isActive = activeCategory === category.key;

                    return (
                      <Pressable
                        key={category.key}
                        onPress={() => setActiveCategory(category.key)}
                        style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                      >
                        <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                          {category.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <ScrollView
                  contentContainerStyle={styles.intentRail}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {quickFilters.map((filter) => (
                    <Pressable
                      key={filter.label}
                      onPress={() => {
                        setActiveCategory(filter.category);
                        setQuery(filter.query);
                      }}
                      style={styles.intentChip}
                    >
                      <Sparkles color="#A8FF5A" size={13} />
                      <Text style={styles.intentText}>{filter.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <MapPanel
                  dispensaries={runtimeDispensaries}
                  expanded={activeTab === 'map'}
                  onOpenDispensary={setSheetDispensary}
                  onSelectDispensary={setSelectedDispensary}
                  selectedDispensary={selectedDispensary}
                />

                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Best deals right now</Text>
                    <Text style={styles.sectionMeta}>
                      {sortLabels[shopperSettings.sortMode]} · within {formatRadius(shopperSettings.radiusMiles)}
                    </Text>
                  </View>
                  <View style={styles.liveBadge}>
                    <View style={[styles.liveDot, lastFetchError && styles.liveDotStale]} />
                    <Text style={styles.liveBadgeText}>{dataSourceLabel}</Text>
                  </View>
                </View>

                <View style={styles.dealStack}>
                  {filteredDeals.length ? (
                    filteredDeals.map((deal) => (
                      <DealCard
                        deal={deal}
                        isSaved={savedDealIds.includes(deal.id)}
                        key={deal.id}
                        onPress={() => {
                          const parent = runtimeDispensaries.find(
                            (dispensary) => dispensary.id === deal.dispensaryId,
                          );
                          setSelectedDispensary(parent ?? null);
                          setSelectedDeal(deal);
                        }}
                        onToggleSaved={() => toggleSavedDeal(deal.id)}
                      />
                    ))
                  ) : (
                    <EmptyState
                      actionLabel="Reset filters"
                      message="Try widening your radius, clearing search, or switching categories."
                      onAction={() => {
                        setQuery('');
                        setActiveCategory('all');
                        setShopperSettings(defaultShopperSettings);
                      }}
                      title="No matching deals"
                    />
                  )}
                </View>
              </>
            )}

            {activeTab === 'alerts' && (
              <AlertsScreen
                alertMatches={visibleAlertMatches}
                alerts={smartAlerts}
                onCreateAlert={() => setAlertBuilderVisible(true)}
                onOpenDeal={setSelectedDeal}
                onToggleAlert={toggleSmartAlert}
              />
            )}
            {activeTab === 'saved' && (
              <SavedScreen
                deals={savedDeals}
                onOpenDeal={setSelectedDeal}
                onToggleSaved={toggleSavedDeal}
                savedSavings={savedSavings}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileScreen
                alertCount={smartAlerts.length}
                onChangeSettings={updateShopperSettings}
                pushStatus={pushStatus}
                savedCount={savedDeals.length}
                savedSavings={savedSavings}
                settings={shopperSettings}
              />
            )}
          </ScrollView>

          <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
        </SafeAreaView>

        <DispensarySheet
          dispensary={sheetDispensary}
          onClose={() => setSheetDispensary(null)}
          onOpenDeal={(deal) => {
            setSheetDispensary(null);
            setSelectedDeal(deal);
          }}
        />
        <ProductSheet
          deal={selectedDeal}
          isSaved={selectedDeal ? savedDealIds.includes(selectedDeal.id) : false}
          onClose={() => setSelectedDeal(null)}
          onToggleSaved={() => {
            if (selectedDeal) {
              toggleSavedDeal(selectedDeal.id);
            }
          }}
        />
        <FilterSheet
          activeCategory={activeCategory}
          onChangeCategory={setActiveCategory}
          onChangeSettings={updateShopperSettings}
          onClose={() => setFilterSheetVisible(false)}
          settings={shopperSettings}
          visible={filterSheetVisible}
        />
        <AlertBuilderSheet
          onClose={() => setAlertBuilderVisible(false)}
          onCreate={createSmartAlert}
          visible={alertBuilderVisible}
        />
      </LinearGradient>
    </SafeAreaProvider>
  );
}

function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  return (
    <LinearGradient colors={['#101411', '#19251D', '#111713']} style={styles.ageGate}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.ageGateSafe}>
        <View style={styles.ageGateLogo}>
          <Radar color="#67F38F" size={42} strokeWidth={2.2} />
        </View>
        <Text style={styles.ageGateTitle}>LeafRadar</Text>
        <Text style={styles.ageGateSubtitle}>New Jersey cannabis price intelligence for adults 21+.</Text>
        <View style={styles.ageGateNotice}>
          <ShieldCheck color="#67F38F" size={22} />
          <Text style={styles.ageGateNoticeText}>
            LeafRadar compares public menu prices and deal signals. It does not sell cannabis.
          </Text>
        </View>
        <Pressable onPress={onConfirm} style={styles.primaryButton}>
          <Check color="#0D120F" size={20} />
          <Text style={styles.primaryButtonText}>I am 21 or older</Text>
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}

function BootScreen() {
  return (
    <LinearGradient colors={['#101411', '#17221B', '#101411']} style={styles.ageGate}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.bootSafe}>
        <View style={styles.logoMarkLarge}>
          <Radar color="#67F38F" size={34} strokeWidth={2.4} />
        </View>
        <Text style={styles.bootTitle}>LeafRadar</Text>
        <Text style={styles.bootText}>Loading your deal radar...</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

function MetricCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'amber' | 'blue' | 'green';
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={[styles.metricLabel, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

function MapPanel({
  dispensaries,
  expanded,
  onOpenDispensary,
  onSelectDispensary,
  selectedDispensary,
}: {
  dispensaries: Dispensary[];
  expanded: boolean;
  onOpenDispensary: (dispensary: Dispensary) => void;
  onSelectDispensary: (dispensary: Dispensary) => void;
  selectedDispensary: Dispensary | null;
}) {
  const activeDeal = selectedDispensary ? getBestDeal(selectedDispensary) : null;

  return (
    <View style={[styles.mapPanel, expanded && styles.mapPanelExpanded]}>
      <View style={styles.mapFrame}>
        <MapView
          initialRegion={{
            latitude: 39.95,
            latitudeDelta: expanded ? 1.95 : 2.9,
            longitude: -74.55,
            longitudeDelta: expanded ? 1.65 : 2.2,
          }}
          pitchEnabled={false}
          rotateEnabled={false}
          style={styles.map}
        >
          {dispensaries.map((dispensary) => {
            const isActive = selectedDispensary?.id === dispensary.id;
            const bestDeal = getBestDeal(dispensary);

            return (
              <Marker
                coordinate={{
                  latitude: dispensary.latitude,
                  longitude: dispensary.longitude,
                }}
                key={dispensary.id}
                onPress={() => onSelectDispensary(dispensary)}
              >
                <View
                  style={[
                    styles.marker,
                    { backgroundColor: strengthColors[bestDeal.strength] },
                    isActive && styles.markerActive,
                  ]}
                >
                  <Text style={styles.markerText}>{currency.format(bestDeal.currentPrice)}</Text>
                </View>
              </Marker>
            );
          })}
        </MapView>
      </View>

      {selectedDispensary && activeDeal && (
        <Pressable
          style={styles.mapSelectionStrip}
          onPress={() => onOpenDispensary(selectedDispensary)}
        >
          <View>
            <Text style={styles.calloutTitle}>{selectedDispensary.name}</Text>
            <Text style={styles.calloutMeta}>
              {selectedDispensary.city} · {selectedDispensary.dealCount} deals · score{' '}
              {selectedDispensary.valueScore}
            </Text>
          </View>
          <View style={styles.calloutPrice}>
            <Text style={styles.calloutPriceText}>{currency.format(activeDeal.currentPrice)}</Text>
            <ChevronRight color="#EAF4E8" size={18} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function DealCard({
  deal,
  isSaved,
  onPress,
  onToggleSaved,
}: {
  deal: IndexedDeal;
  isSaved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.dealCard}>
      <View style={styles.dealTopRow}>
        <View style={styles.dealIcon}>
          <Flame color="#0D120F" size={18} fill="#67F38F" />
        </View>
        <View style={styles.dealTitleBlock}>
          <Text style={styles.dealBrand}>{deal.brand}</Text>
          <Text numberOfLines={1} style={styles.dealName}>
            {deal.productName}
          </Text>
        </View>
        <Pressable onPress={onToggleSaved} style={styles.iconButton}>
          <Heart color={isSaved ? '#FF7D7D' : '#DCE9DA'} fill={isSaved ? '#FF7D7D' : 'none'} size={19} />
        </Pressable>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.currentPrice}>{currency.format(deal.currentPrice)}</Text>
        {deal.originalPrice && (
          <Text style={styles.originalPrice}>{currency.format(deal.originalPrice)}</Text>
        )}
        <Text style={styles.savingsBadge}>{deal.savingsPct}% off</Text>
      </View>

      <Text style={styles.dealText}>{deal.dealText}</Text>

      <View style={styles.dealMetaRow}>
        <Text style={styles.dealMeta}>{deal.format}</Text>
        <Text style={styles.dealMeta}>{deal.thc}</Text>
        <Text style={styles.dealMeta}>{deal.pricePerUnit}</Text>
      </View>

      <View style={styles.dealFooter}>
        <Text style={styles.dispensaryLine}>
          {deal.dispensaryName} · {deal.city}
        </Text>
        <Text style={styles.distanceLine}>{deal.distanceMiles.toFixed(1)} mi</Text>
      </View>
    </Pressable>
  );
}

function DispensarySheet({
  dispensary,
  onClose,
  onOpenDeal,
}: {
  dispensary: Dispensary | null;
  onClose: () => void;
  onOpenDeal: (deal: IndexedDeal) => void;
}) {
  if (!dispensary) {
    return null;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(dispensary)}>
      <View style={styles.modalScrim}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>{dispensary.name}</Text>
              <Text style={styles.sheetSubtitle}>
                {dispensary.city}, {dispensary.county} · updated {dispensary.updatedAt}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X color="#E8F1E5" size={20} />
            </Pressable>
          </View>

          <View style={styles.sheetMetrics}>
            <MetricCard label="Value" tone="green" value={String(dispensary.valueScore)} />
            <MetricCard label="Deals" tone="amber" value={String(dispensary.dealCount)} />
            <MetricCard label="Save" tone="blue" value={`${dispensary.averageSavings}%`} />
          </View>

          <Text style={styles.sheetSectionTitle}>Top indexed deals</Text>
          {dispensary.deals.map((deal) => (
            <Pressable
              key={deal.id}
              onPress={() =>
                onOpenDeal({
                  ...deal,
                  city: dispensary.city,
                  dispensaryId: dispensary.id,
                  dispensaryName: dispensary.name,
                  distanceMiles: dispensary.distanceMiles,
                  menuSource: dispensary.menuSource,
                  updatedAt: dispensary.updatedAt,
                  valueScore: dispensary.valueScore,
                })
              }
              style={styles.sheetDealRow}
            >
              <View style={styles.sheetDealCopy}>
                <Text style={styles.sheetDealName}>{deal.productName}</Text>
                <Text style={styles.sheetDealMeta}>
                  {deal.brand} · {deal.format} · {deal.verification}
                </Text>
              </View>
              <Text style={styles.sheetDealPrice}>{currency.format(deal.currentPrice)}</Text>
            </Pressable>
          ))}

          <View style={styles.sourceRow}>
            <CircleDollarSign color="#67F38F" size={18} />
            <Text style={styles.sourceText}>
              Source path: {dispensary.menuSource} → normalizer → deal engine
            </Text>
          </View>
          <Pressable onPress={() => openMapsForDispensary(dispensary)} style={styles.secondaryDarkButton}>
            <MapPin color="#A8FF5A" size={18} />
            <Text style={styles.secondaryDarkButtonText}>Open directions</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ProductSheet({
  deal,
  isSaved,
  onClose,
  onToggleSaved,
}: {
  deal: IndexedDeal | null;
  isSaved: boolean;
  onClose: () => void;
  onToggleSaved: () => void;
}) {
  if (!deal) {
    return null;
  }

  const stats = getPriceStats(deal);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(deal)}>
      <View style={styles.modalScrim}>
        <View style={styles.productSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.productHeaderCopy}>
              <Text style={styles.productBrand}>{deal.brand}</Text>
              <Text style={styles.sheetTitle}>{deal.productName}</Text>
              <Text style={styles.sheetSubtitle}>
                {deal.format} · {deal.category} · updated {deal.updatedAt}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X color="#E8F1E5" size={20} />
            </Pressable>
          </View>

          <View style={styles.cheapestPanel}>
            <View>
              <Text style={styles.cheapestLabel}>Cheapest price in NJ</Text>
              <Text style={styles.cheapestStore}>
                {deal.dispensaryName} · {deal.city}
              </Text>
            </View>
            <View style={styles.cheapestPriceBlock}>
              <Text style={styles.cheapestPrice}>{currency.format(deal.currentPrice)}</Text>
              <Text style={styles.cheapestDistance}>{deal.distanceMiles.toFixed(1)} mi</Text>
            </View>
          </View>

          <View style={styles.priceStatsRow}>
            <MiniStat label="Lowest" value={currency.format(stats.lowest)} />
            <MiniStat label="Average" value={currency.format(stats.average)} />
            <MiniStat label="Highest" value={currency.format(stats.highest)} />
          </View>

          <View style={styles.historyPanel}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.sheetSectionTitle}>Price history</Text>
                <Text style={styles.historySubtext}>30-day observed trend</Text>
              </View>
              <View style={styles.dropBadge}>
                <TrendingDown color="#101411" size={15} />
                <Text style={styles.dropBadgeText}>{deal.savingsPct}% off</Text>
              </View>
            </View>
            <PriceHistoryChart deal={deal} />
          </View>

          <View style={styles.productInfoGrid}>
            <MiniStat label="THC" value={deal.thc || 'n/a'} />
            <MiniStat label="Type" value={deal.category} />
            <MiniStat label="Size" value={deal.format} />
          </View>

          <Text style={styles.productDescription}>
            {deal.description || deal.dealText}
          </Text>

          <View style={styles.productActions}>
            <Pressable onPress={onToggleSaved} style={styles.outlineButton}>
              <Heart color="#A8FF5A" fill={isSaved ? '#A8FF5A' : 'none'} size={18} />
              <Text style={styles.outlineButtonText}>{isSaved ? 'Saved' : 'Save product'}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.findDealButton}>
              <MapPin color="#101411" size={18} />
              <Text style={styles.findDealButtonText}>Find deals</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text numberOfLines={1} style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function PriceHistoryChart({ deal }: { deal: IndexedDeal }) {
  const history = getPriceHistory(deal);
  const prices = history.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, 1);
  const points = history
    .map((point, index) => {
      const x = 14 + (index / Math.max(history.length - 1, 1)) * 272;
      const y = 116 - ((point.price - min) / range) * 92;

      return `${x},${y}`;
    })
    .join(' ');
  const lastPoint = history[history.length - 1];
  const lastX = 286;
  const lastY = 116 - ((lastPoint.price - min) / range) * 92;

  return (
    <View style={styles.chartShell}>
      <Svg height="140" viewBox="0 0 300 140" width="100%">
        {[24, 47, 70, 93, 116].map((y) => (
          <Line key={y} stroke="#26352B" strokeWidth="1" x1="12" x2="288" y1={y} y2={y} />
        ))}
        <Polyline fill="none" points={points} stroke="#A8FF5A" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <Circle cx={lastX} cy={lastY} fill="#A8FF5A" r="5" />
      </Svg>
      <View style={styles.chartXAxis}>
        <Text style={styles.chartLabel}>{history[0]?.date}</Text>
        <Text style={styles.chartToday}>{currency.format(lastPoint.price)} today</Text>
        <Text style={styles.chartLabel}>Today</Text>
      </View>
    </View>
  );
}

function AlertsScreen({
  alertMatches,
  alerts,
  onCreateAlert,
  onOpenDeal,
  onToggleAlert,
}: {
  alertMatches: AlertMatch[];
  alerts: SmartAlert[];
  onCreateAlert: () => void;
  onOpenDeal: (deal: IndexedDeal) => void;
  onToggleAlert: (alertId: string) => void;
}) {
  const matchByAlertId = new Map(alertMatches.map((match) => [match.id, match]));

  return (
    <View style={styles.tabSurface}>
      <View style={styles.pageTitleRow}>
        <View>
          <Text style={styles.pageTitle}>My alerts</Text>
          <Text style={styles.sectionMeta}>Price drops, thresholds, and daily deal triggers</Text>
        </View>
        <Pressable accessibilityLabel="Create smart alert" onPress={onCreateAlert} style={styles.addButton}>
          <Plus color="#EAF4E8" size={21} />
        </Pressable>
      </View>

      {alertMatches.length > 0 && (
        <View style={styles.liveMatchesPanel}>
          <View style={styles.sectionHeaderCompact}>
            <Text style={styles.sectionTitle}>Live alert matches</Text>
            <Text style={styles.sectionMeta}>Fresh deals that hit your rules</Text>
          </View>

          {alertMatches.map((match) => (
            <View key={match.id} style={styles.matchCard}>
              <View style={styles.matchHeader}>
                <View>
                  <Text style={styles.matchTitle}>{match.label}</Text>
                  <Text style={styles.alertMeta}>
                    {match.matchCount} live {match.matchCount === 1 ? 'match' : 'matches'}
                  </Text>
                </View>
                <View style={styles.matchCountBadge}>
                  <Text style={styles.matchCountText}>{match.matchCount}</Text>
                </View>
              </View>

              {match.topDeals.slice(0, 2).map((deal) => (
                <Pressable key={deal.id} onPress={() => onOpenDeal(deal)} style={styles.matchDealRow}>
                  <View style={styles.matchDealCopy}>
                    <Text numberOfLines={1} style={styles.matchDealName}>
                      {deal.productName}
                    </Text>
                    <Text numberOfLines={1} style={styles.matchDealMeta}>
                      {deal.dispensaryName} · {deal.city}
                    </Text>
                  </View>
                  <View style={styles.matchPriceBlock}>
                    <Text style={styles.matchDealPrice}>{currency.format(deal.currentPrice)}</Text>
                    <Text style={styles.matchDealSave}>{deal.savingsPct}% off</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}

      <View style={styles.segmentedControl}>
        <View style={styles.segmentActive}>
          <Text style={styles.segmentActiveText}>Price alerts</Text>
        </View>
        <View style={styles.segmentInactive}>
          <Text style={styles.segmentInactiveText}>Deal alerts</Text>
        </View>
      </View>

      {alerts.map((alert) => {
        const match = matchByAlertId.get(alert.id);

        return (
          <Pressable key={alert.id} onPress={() => onToggleAlert(alert.id)} style={styles.alertCard}>
            <View>
              <Text style={styles.alertTitle}>{alert.label}</Text>
              <Text style={styles.alertMeta}>{describeAlert(alert)}</Text>
              <Text style={styles.alertActiveText}>
                {alert.active ? 'Active' : 'Paused'} · {match?.matchCount || 0} live
              </Text>
            </View>
            <Bell color="#A8FF5A" size={21} />
          </Pressable>
        );
      })}

      <Pressable onPress={onCreateAlert} style={styles.secondaryButton}>
        <Sparkles color="#0D120F" size={18} />
        <Text style={styles.secondaryButtonText}>Create smart alert</Text>
      </Pressable>
    </View>
  );
}

function describeAlert(alert: SmartAlert) {
  const parts = [
    alert.brand ? `${alert.brand} only` : categoryLabel(alert.category),
    alert.maxPrice ? `under ${currency.format(alert.maxPrice)}` : null,
    alert.radiusMiles ? `within ${alert.radiusMiles} miles` : alert.region,
  ].filter(Boolean);

  return parts.join(' · ') || 'Any matching deal';
}

function categoryLabel(category?: DealCategory) {
  if (!category) {
    return 'Any category';
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
}

function EmptyState({
  actionLabel,
  message,
  onAction,
  title,
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Radar color="#67F38F" size={26} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function FilterSheet({
  activeCategory,
  onChangeCategory,
  onChangeSettings,
  onClose,
  settings,
  visible,
}: {
  activeCategory: CategoryFilter;
  onChangeCategory: (category: CategoryFilter) => void;
  onChangeSettings: (patch: Partial<ShopperSettings>) => void;
  onClose: () => void;
  settings: ShopperSettings;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalScrim}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Deal filters</Text>
              <Text style={styles.sheetSubtitle}>Tune the radar for today’s pickup.</Text>
            </View>
            <Pressable accessibilityLabel="Close filters" onPress={onClose} style={styles.closeButton}>
              <X color="#E8F1E5" size={20} />
            </Pressable>
          </View>

          <Text style={styles.sheetSectionTitle}>Sort</Text>
          <View style={styles.choiceGrid}>
            {(Object.keys(sortLabels) as SortMode[]).map((sortMode) => (
              <Pressable
                key={sortMode}
                onPress={() => onChangeSettings({ sortMode })}
                style={[styles.choiceChip, settings.sortMode === sortMode && styles.choiceChipActive]}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    settings.sortMode === sortMode && styles.choiceChipTextActive,
                  ]}
                >
                  {sortLabels[sortMode]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sheetSectionTitle}>Category</Text>
          <View style={styles.choiceGrid}>
            {categories.map((category) => (
              <Pressable
                key={category.key}
                onPress={() => onChangeCategory(category.key)}
                style={[styles.choiceChip, activeCategory === category.key && styles.choiceChipActive]}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    activeCategory === category.key && styles.choiceChipTextActive,
                  ]}
                >
                  {category.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sheetSectionTitle}>Radius</Text>
          <View style={styles.choiceGrid}>
            {[10, 25, 60, 0].map((radius) => (
              <Pressable
                key={radius}
                onPress={() => onChangeSettings({ radiusMiles: radius })}
                style={[styles.choiceChip, settings.radiusMiles === radius && styles.choiceChipActive]}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    settings.radiusMiles === radius && styles.choiceChipTextActive,
                  ]}
                >
                  {formatRadius(radius)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.filterToggleRow}>
            <Text style={styles.preferenceLabel}>Open now only</Text>
            <Pressable
              onPress={() => onChangeSettings({ openNowOnly: !settings.openNowOnly })}
              style={[styles.switchTrack, settings.openNowOnly && styles.switchTrackActive]}
            >
              <View style={[styles.switchThumb, settings.openNowOnly && styles.switchThumbActive]} />
            </Pressable>
          </View>

          <View style={styles.filterToggleRow}>
            <Text style={styles.preferenceLabel}>Verified deals only</Text>
            <Pressable
              onPress={() => onChangeSettings({ verifiedOnly: !settings.verifiedOnly })}
              style={[styles.switchTrack, settings.verifiedOnly && styles.switchTrackActive]}
            >
              <View style={[styles.switchThumb, settings.verifiedOnly && styles.switchThumbActive]} />
            </Pressable>
          </View>

          <View style={styles.productActions}>
            <Pressable
              onPress={() => {
                onChangeCategory('all');
                onChangeSettings(defaultShopperSettings);
              }}
              style={styles.outlineButton}
            >
              <Text style={styles.outlineButtonText}>Reset</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.findDealButton}>
              <Check color="#101411" size={18} />
              <Text style={styles.findDealButtonText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AlertBuilderSheet({
  onClose,
  onCreate,
  visible,
}: {
  onClose: () => void;
  onCreate: (alert: SmartAlert) => void;
  visible: boolean;
}) {
  const [label, setLabel] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [maxPrice, setMaxPrice] = useState('40');
  const [radiusMiles, setRadiusMiles] = useState('25');
  const [region, setRegion] = useState<ShopperSettings['region']>('NJ');

  const createAlert = () => {
    const parsedMaxPrice = parseOptionalNumber(maxPrice);
    const parsedRadius = parseOptionalNumber(radiusMiles);
    const displayCategory = category === 'all' ? undefined : category;
    const alertLabel =
      label.trim() ||
      [
        brand.trim() || categoryLabel(displayCategory),
        parsedMaxPrice ? `under ${currency.format(parsedMaxPrice)}` : null,
      ]
        .filter(Boolean)
        .join(' ');

    onCreate({
      active: true,
      brand: brand.trim() || undefined,
      category: displayCategory,
      id: `custom-${Date.now()}-${slugify(alertLabel)}`,
      label: alertLabel,
      maxPrice: parsedMaxPrice,
      radiusMiles: parsedRadius,
      region,
    });

    setLabel('');
    setBrand('');
    setCategory('all');
    setMaxPrice('40');
    setRadiusMiles('25');
    setRegion('NJ');
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalScrim}>
        <View style={styles.productSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Create alert</Text>
              <Text style={styles.sheetSubtitle}>Track a price, brand, category, or region.</Text>
            </View>
            <Pressable accessibilityLabel="Close alert builder" onPress={onClose} style={styles.closeButton}>
              <X color="#E8F1E5" size={20} />
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Alert name</Text>
          <TextInput
            onChangeText={setLabel}
            placeholder="Cheap carts near me"
            placeholderTextColor="#7F8E7D"
            style={styles.formInput}
            value={label}
          />

          <Text style={styles.inputLabel}>Category</Text>
          <View style={styles.choiceGrid}>
            {categories.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setCategory(item.key)}
                style={[styles.choiceChip, category === item.key && styles.choiceChipActive]}
              >
                <Text style={[styles.choiceChipText, category === item.key && styles.choiceChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.inputLabel}>Brand optional</Text>
          <TextInput
            autoCapitalize="words"
            onChangeText={setBrand}
            placeholder="Cookies, MPX, Rythm..."
            placeholderTextColor="#7F8E7D"
            style={styles.formInput}
            value={brand}
          />

          <View style={styles.formSplitRow}>
            <View style={styles.formSplitItem}>
              <Text style={styles.inputLabel}>Max price</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setMaxPrice}
                placeholder="40"
                placeholderTextColor="#7F8E7D"
                style={styles.formInput}
                value={maxPrice}
              />
            </View>
            <View style={styles.formSplitItem}>
              <Text style={styles.inputLabel}>Radius mi</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setRadiusMiles}
                placeholder="25"
                placeholderTextColor="#7F8E7D"
                style={styles.formInput}
                value={radiusMiles}
              />
            </View>
          </View>

          <Text style={styles.inputLabel}>Region</Text>
          <View style={styles.choiceGrid}>
            {(['NJ', 'North Jersey', 'Central Jersey', 'South Jersey'] as ShopperSettings['region'][]).map(
              (nextRegion) => (
                <Pressable
                  key={nextRegion}
                  onPress={() => setRegion(nextRegion)}
                  style={[styles.choiceChip, region === nextRegion && styles.choiceChipActive]}
                >
                  <Text style={[styles.choiceChipText, region === nextRegion && styles.choiceChipTextActive]}>
                    {nextRegion}
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          <Pressable onPress={createAlert} style={styles.findDealButton}>
            <Bell color="#101411" size={18} />
            <Text style={styles.findDealButtonText}>Start tracking</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SavedScreen({
  deals,
  onOpenDeal,
  onToggleSaved,
  savedSavings,
}: {
  deals: IndexedDeal[];
  onOpenDeal: (deal: IndexedDeal) => void;
  onToggleSaved: (dealId: string) => void;
  savedSavings: number;
}) {
  return (
    <View style={styles.tabSurface}>
      <View style={styles.pageHeaderIcon}>
        <Bookmark color="#67F38F" size={24} />
      </View>
      <Text style={styles.pageTitle}>Saved deals</Text>
      <View style={styles.savingsSummaryCard}>
        <Text style={styles.summaryLabel}>Tracked savings</Text>
        <Text style={styles.summaryValue}>{currency.format(savedSavings)}</Text>
        <Text style={styles.summaryMeta}>{deals.length} saved {deals.length === 1 ? 'deal' : 'deals'}</Text>
      </View>
      <View style={styles.dealStack}>
        {deals.length ? (
          deals.map((deal) => (
            <DealCard
              deal={deal}
              isSaved
              key={deal.id}
              onPress={() => onOpenDeal(deal)}
              onToggleSaved={() => onToggleSaved(deal.id)}
            />
          ))
        ) : (
          <EmptyState
            message="Tap the heart on any deal to keep it here and track the current discount."
            title="No saved deals yet"
          />
        )}
      </View>
    </View>
  );
}

function ProfileScreen({
  alertCount,
  onChangeSettings,
  pushStatus,
  savedCount,
  savedSavings,
  settings,
}: {
  alertCount: number;
  onChangeSettings: (patch: Partial<ShopperSettings>) => void;
  pushStatus: 'denied' | 'enabled' | 'error' | 'idle' | 'simulator';
  savedCount: number;
  savedSavings: number;
  settings: ShopperSettings;
}) {
  return (
    <View style={styles.tabSurface}>
      <View style={styles.pageHeaderIcon}>
        <Settings color="#67F38F" size={24} />
      </View>
      <Text style={styles.pageTitle}>Shopper settings</Text>
      <View style={styles.profileStatsGrid}>
        <MetricCard label="Saved" tone="green" value={String(savedCount)} />
        <MetricCard label="Tracked" tone="amber" value={currency.format(savedSavings)} />
        <MetricCard label="Alerts" tone="blue" value={String(alertCount)} />
      </View>
      <View style={styles.preferenceRow}>
        <Text style={styles.preferenceLabel}>Default radius</Text>
        <View style={styles.preferenceChipGroup}>
          {[10, 25, 60].map((radius) => (
            <Pressable
              key={radius}
              onPress={() => onChangeSettings({ radiusMiles: radius })}
              style={[styles.smallChoiceChip, settings.radiusMiles === radius && styles.smallChoiceChipActive]}
            >
              <Text
                style={[
                  styles.smallChoiceText,
                  settings.radiusMiles === radius && styles.smallChoiceTextActive,
                ]}
              >
                {radius}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.preferenceRow}>
        <Text style={styles.preferenceLabel}>Market</Text>
        <Text style={styles.preferenceValue}>{settings.region}</Text>
      </View>
      <View style={styles.preferenceRow}>
        <Text style={styles.preferenceLabel}>Mode</Text>
        <Pressable
          onPress={() =>
            onChangeSettings({
              mode:
                settings.mode === 'Adult-use deals'
                  ? 'Medical-friendly deals'
                  : 'Adult-use deals',
            })
          }
        >
          <Text style={styles.preferenceValue}>{settings.mode}</Text>
        </Pressable>
      </View>
      <View style={styles.preferenceRow}>
        <Text style={styles.preferenceLabel}>Open now only</Text>
        <Pressable
          onPress={() => onChangeSettings({ openNowOnly: !settings.openNowOnly })}
          style={[styles.switchTrack, settings.openNowOnly && styles.switchTrackActive]}
        >
          <View style={[styles.switchThumb, settings.openNowOnly && styles.switchThumbActive]} />
        </Pressable>
      </View>
      <View style={styles.preferenceRow}>
        <Text style={styles.preferenceLabel}>Verified deals only</Text>
        <Pressable
          onPress={() => onChangeSettings({ verifiedOnly: !settings.verifiedOnly })}
          style={[styles.switchTrack, settings.verifiedOnly && styles.switchTrackActive]}
        >
          <View style={[styles.switchThumb, settings.verifiedOnly && styles.switchThumbActive]} />
        </Pressable>
      </View>
      <View style={styles.preferenceRow}>
        <Text style={styles.preferenceLabel}>Push alerts</Text>
        <Text style={styles.preferenceValue}>{pushStatusLabel(pushStatus)}</Text>
      </View>
    </View>
  );
}

function BottomNav({
  activeTab,
  onChangeTab,
}: {
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {navItems.map(({ Icon, key, label }) => {
        const isActive = activeTab === key;

        return (
          <Pressable key={key} onPress={() => onChangeTab(key)} style={styles.navItem}>
            <Icon color={isActive ? '#67F38F' : '#AEB9AD'} size={21} strokeWidth={2.2} />
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function sortDeals(a: IndexedDeal, b: IndexedDeal, sortMode: SortMode) {
  if (sortMode === 'cheapest') {
    return a.currentPrice - b.currentPrice;
  }

  if (sortMode === 'nearest') {
    return a.distanceMiles - b.distanceMiles;
  }

  if (sortMode === 'drop') {
    return b.savingsPct - a.savingsPct || a.currentPrice - b.currentPrice;
  }

  if (sortMode === 'verified') {
    const aVerified = a.verification === 'verified' || a.verification === 'partner-feed';
    const bVerified = b.verification === 'verified' || b.verification === 'partner-feed';

    if (aVerified !== bVerified) {
      return aVerified ? -1 : 1;
    }
  }

  return b.savingsPct - a.savingsPct || a.distanceMiles - b.distanceMiles;
}

function buildClientAlertMatches(alerts: SmartAlert[], deals: IndexedDeal[]) {
  return alerts
    .filter((alert) => alert.active)
    .map((alert) => {
      const topDeals = deals
        .filter((deal) => alertMatchesDeal(alert, deal))
        .sort((a, b) => sortDeals(a, b, 'drop'))
        .slice(0, 6);

      return {
        ...alert,
        matchCount: topDeals.length,
        topDeals,
      };
    })
    .filter((match) => match.matchCount > 0);
}

function alertMatchesDeal(alert: SmartAlert, deal: IndexedDeal) {
  if (alert.category && deal.category !== alert.category) {
    return false;
  }

  if (alert.maxPrice && deal.currentPrice > alert.maxPrice) {
    return false;
  }

  if (alert.radiusMiles && deal.distanceMiles > alert.radiusMiles) {
    return false;
  }

  if (alert.brand && !textIncludes(`${deal.brand} ${deal.productName}`, alert.brand)) {
    return false;
  }

  if (alert.region && !regionMatchesDeal(alert.region, deal)) {
    return false;
  }

  if (alert.id.includes('bogo')) {
    return textIncludes(deal.dealText, 'bogo') || deal.savingsPct >= 40;
  }

  if (alert.id.includes('cookies')) {
    return textIncludes(`${deal.brand} ${deal.productName}`, 'cookies');
  }

  return true;
}

function regionMatchesDeal(region: SmartAlert['region'], deal: IndexedDeal) {
  const normalized = String(region || '').toLowerCase();

  if (!normalized || normalized === 'nj' || normalized === 'new jersey') {
    return true;
  }

  const city = String(deal.city || '').toLowerCase();
  const county = String((deal as IndexedDeal & { county?: string }).county || '').toLowerCase();
  const southJerseyCounties = new Set([
    'atlantic',
    'burlington',
    'camden',
    'cape may',
    'cumberland',
    'gloucester',
    'ocean',
    'salem',
  ]);

  if (normalized === 'south jersey') {
    return southJerseyCounties.has(county);
  }

  if (normalized === 'north jersey') {
    return ['bergen', 'essex', 'hudson', 'morris', 'passaic', 'sussex', 'union', 'warren'].includes(county);
  }

  if (normalized === 'central jersey') {
    return ['hunterdon', 'mercer', 'middlesex', 'monmouth', 'somerset'].includes(county);
  }

  return textIncludes(`${city} ${county} ${deal.dispensaryName}`, normalized);
}

function mergeSmartAlerts(baseAlerts: SmartAlert[], overrideAlerts: SmartAlert[]) {
  const merged = new Map<string, SmartAlert>();

  for (const alert of baseAlerts) {
    merged.set(alert.id, alert);
  }

  for (const alert of overrideAlerts) {
    merged.set(alert.id, {
      ...merged.get(alert.id),
      ...alert,
    });
  }

  return [...merged.values()];
}

function formatRadius(radiusMiles: number) {
  return radiusMiles <= 0 ? 'all NJ' : `${radiusMiles} mi`;
}

function parseOptionalNumber(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function readStorage<T>(key: string) {
  const value = await AsyncStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : null;
}

async function writeStorage(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function postJson<T>(path: string, body: unknown) {
  return requestJson<T>(path, {
    body: JSON.stringify(body),
    method: 'POST',
  });
}

async function patchJson<T>(path: string, body: unknown) {
  return requestJson<T>(path, {
    body: JSON.stringify(body),
    method: 'PATCH',
  });
}

async function requestJson<T>(path: string, init: RequestInit) {
  const apiRoot = getApiRoot();

  if (!apiRoot) {
    throw new Error('LeafRadar API URL is not configured');
  }

  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`LeafRadar API returned ${response.status}`);
  }

  return (await response.json()) as T;
}

function getApiRoot() {
  const apiBaseUrl = process.env?.EXPO_PUBLIC_LEAFRADAR_API_URL;
  return apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : null;
}

async function registerForPushNotifications(
  setPushStatus: (status: 'denied' | 'enabled' | 'error' | 'idle' | 'simulator') => void,
) {
  if (!Device.isDevice) {
    setPushStatus('simulator');
    return;
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('deal-alerts', {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: 'Deal alerts',
      });
    }

    const existingPermission = await Notifications.getPermissionsAsync();
    let finalStatus = existingPermission.status;

    if (finalStatus !== 'granted') {
      const requestedPermission = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermission.status;
    }

    if (finalStatus !== 'granted') {
      setPushStatus('denied');
      return;
    }

    const expoPushToken = (await Notifications.getExpoPushTokenAsync()).data;
    await postJson('/api/push-tokens', {
      deviceId: Device.osBuildId || Device.deviceName,
      expoPushToken,
      platform: Platform.OS,
      userId: 'anonymous',
    });
    setPushStatus('enabled');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown push registration error';
    console.warn(`LeafRadar push registration failed. ${message}`);
    setPushStatus('error');
  }
}

function pushStatusLabel(status: 'denied' | 'enabled' | 'error' | 'idle' | 'simulator') {
  if (status === 'enabled') {
    return 'Enabled';
  }

  if (status === 'denied') {
    return 'Permission denied';
  }

  if (status === 'simulator') {
    return 'Device only';
  }

  if (status === 'error') {
    return 'Needs setup';
  }

  return 'Ready after alert';
}

function textIncludes(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function openMapsForDispensary(dispensary: Dispensary) {
  const label = encodeURIComponent(dispensary.name);
  const url = `http://maps.apple.com/?ll=${dispensary.latitude},${dispensary.longitude}&q=${label}`;
  void Linking.openURL(url);
}

const styles = StyleSheet.create({
  ageGate: {
    flex: 1,
  },
  ageGateLogo: {
    alignItems: 'center',
    backgroundColor: '#1F2B23',
    borderColor: '#2F5A3A',
    borderRadius: 30,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    marginBottom: 22,
    width: 96,
  },
  ageGateNotice: {
    alignItems: 'flex-start',
    backgroundColor: '#1A241D',
    borderColor: '#2B3B2F',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
    padding: 16,
  },
  ageGateNoticeText: {
    color: '#DCE7D7',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  ageGateSafe: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  ageGateSubtitle: {
    color: '#B8C5B5',
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 26,
    maxWidth: 310,
    textAlign: 'center',
  },
  ageGateTitle: {
    color: '#F3FAF0',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 10,
  },
  bootSafe: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  bootText: {
    color: '#AAB8A6',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  bootTitle: {
    color: '#F7FFF3',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 14,
  },
  alertCard: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#2E3A31',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 16,
  },
  alertMeta: {
    color: '#95A394',
    fontSize: 13,
    marginTop: 6,
  },
  alertActiveText: {
    color: '#A8FF5A',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  alertTitle: {
    color: '#F1F8EE',
    fontSize: 16,
    fontWeight: '800',
  },
  amberText: {
    color: '#F3C969',
  },
  app: {
    flex: 1,
  },
  appTitle: {
    color: '#F7FFF3',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#314137',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  blueText: {
    color: '#9FC4FF',
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: '#111713',
    borderColor: '#253128',
    borderRadius: 24,
    borderWidth: 1,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    position: 'absolute',
    right: 14,
  },
  calloutMeta: {
    color: '#A8B4A5',
    fontSize: 12,
    marginTop: 4,
  },
  calloutPrice: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  calloutPriceText: {
    color: '#67F38F',
    fontSize: 18,
    fontWeight: '900',
  },
  calloutTitle: {
    color: '#F5FBF3',
    fontSize: 15,
    fontWeight: '900',
  },
  categoryChip: {
    backgroundColor: '#18211B',
    borderColor: '#2A352D',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  categoryChipActive: {
    backgroundColor: '#67F38F',
    borderColor: '#67F38F',
  },
  categoryRail: {
    gap: 8,
    paddingBottom: 14,
  },
  categoryText: {
    color: '#C7D2C3',
    fontSize: 13,
    fontWeight: '800',
  },
  categoryTextActive: {
    color: '#0F1511',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#243027',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  choiceChip: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#2E3A31',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  choiceChipActive: {
    backgroundColor: '#67F38F',
    borderColor: '#67F38F',
  },
  choiceChipText: {
    color: '#CAD8C7',
    fontSize: 13,
    fontWeight: '900',
  },
  choiceChipTextActive: {
    color: '#101411',
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    marginTop: 10,
  },
  content: {
    paddingBottom: 112,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  currentPrice: {
    color: '#121A14',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
  },
  dealBrand: {
    color: '#7AF49A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dealCard: {
    backgroundColor: '#F4F0E8',
    borderRadius: 8,
    gap: 12,
    padding: 16,
  },
  dealFooter: {
    alignItems: 'center',
    borderTopColor: '#D9D4C8',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  dealIcon: {
    alignItems: 'center',
    backgroundColor: '#67F38F',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  dealMeta: {
    backgroundColor: '#E4DFD3',
    borderRadius: 999,
    color: '#4E594E',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  dealMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  dealName: {
    color: '#162018',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  dealStack: {
    gap: 12,
  },
  dealText: {
    color: '#475246',
    fontSize: 14,
    lineHeight: 20,
  },
  dealTitleBlock: {
    flex: 1,
  },
  dealTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dispensaryLine: {
    color: '#253026',
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  distanceLine: {
    color: '#687368',
    fontSize: 13,
    fontWeight: '900',
  },
  eyebrow: {
    color: '#8FA18B',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  emptyAction: {
    backgroundColor: '#A8FF5A',
    borderRadius: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyActionText: {
    color: '#101411',
    fontSize: 13,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#2E3A31',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  emptyText: {
    color: '#9BA899',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyTitle: {
    color: '#F7FFF3',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
  },
  filterToggleRow: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#2E3A31',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 14,
  },
  greenText: {
    color: '#67F38F',
  },
  formInput: {
    backgroundColor: '#18211B',
    borderColor: '#2E3A31',
    borderRadius: 8,
    borderWidth: 1,
    color: '#F7FFF3',
    fontSize: 15,
    fontWeight: '800',
    minHeight: 46,
    paddingHorizontal: 13,
  },
  formSplitItem: {
    flex: 1,
  },
  formSplitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  intentChip: {
    alignItems: 'center',
    backgroundColor: '#111713',
    borderColor: '#2A352D',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  intentRail: {
    gap: 8,
    paddingBottom: 14,
  },
  intentText: {
    color: '#D9E6D5',
    fontSize: 12,
    fontWeight: '800',
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: '#1B271F',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveBadgeText: {
    color: '#CFE2CA',
    fontSize: 12,
    fontWeight: '900',
  },
  liveDot: {
    backgroundColor: '#67F38F',
    borderRadius: 5,
    height: 8,
    width: 8,
  },
  liveDotStale: {
    backgroundColor: '#F3C969',
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#1E2B22',
    borderColor: '#304537',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  logoMarkLarge: {
    alignItems: 'center',
    backgroundColor: '#1E2B22',
    borderColor: '#304537',
    borderRadius: 30,
    borderWidth: 1,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapFrame: {
    borderRadius: 8,
    flex: 1,
    minHeight: 210,
    overflow: 'hidden',
  },
  mapSelectionStrip: {
    alignItems: 'center',
    backgroundColor: '#111713',
    borderColor: '#314137',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    padding: 12,
  },
  mapPanel: {
    backgroundColor: '#18211B',
    borderColor: '#314137',
    borderRadius: 8,
    borderWidth: 1,
    height: 348,
    marginBottom: 20,
    overflow: 'hidden',
    padding: 8,
  },
  mapPanelExpanded: {
    height: 532,
  },
  marker: {
    alignItems: 'center',
    borderColor: '#0F1511',
    borderRadius: 18,
    borderWidth: 3,
    height: 34,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    paddingHorizontal: 8,
    minWidth: 46,
  },
  markerActive: {
    borderColor: '#F7FFF3',
    transform: [{ scale: 1.12 }],
  },
  markerText: {
    color: '#101411',
    fontSize: 11,
    fontWeight: '900',
  },
  metricCard: {
    backgroundColor: '#18211B',
    borderColor: '#2A352D',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 76,
    padding: 12,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#F6FFF2',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  modalScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    minHeight: 44,
  },
  navLabel: {
    color: '#AEB9AD',
    fontSize: 10,
    fontWeight: '800',
  },
  navLabelActive: {
    color: '#67F38F',
  },
  originalPrice: {
    color: '#92998F',
    fontSize: 17,
    fontWeight: '800',
    textDecorationLine: 'line-through',
  },
  outlineButton: {
    alignItems: 'center',
    borderColor: '#A8FF5A',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  outlineButtonText: {
    color: '#DFFDD3',
    fontSize: 14,
    fontWeight: '900',
  },
  pageHeaderIcon: {
    alignItems: 'center',
    backgroundColor: '#1D2A21',
    borderColor: '#314137',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    marginBottom: 14,
    width: 48,
  },
  pageTitle: {
    color: '#F7FFF3',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 12,
  },
  pageTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  inputLabel: {
    color: '#B7C4B3',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  preferenceLabel: {
    color: '#DCE8D8',
    fontSize: 15,
    fontWeight: '800',
  },
  preferenceRow: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#2E3A31',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 16,
  },
  preferenceChipGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  preferenceValue: {
    color: '#67F38F',
    fontSize: 15,
    fontWeight: '900',
  },
  profileStatsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  priceRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#67F38F',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    width: '100%',
  },
  primaryButtonText: {
    color: '#0D120F',
    fontSize: 16,
    fontWeight: '900',
  },
  cheapestDistance: {
    color: '#9BA899',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  cheapestLabel: {
    color: '#A8FF5A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cheapestPanel: {
    alignItems: 'center',
    backgroundColor: '#1C2A20',
    borderColor: '#31503A',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 14,
  },
  cheapestPrice: {
    color: '#A8FF5A',
    fontSize: 26,
    fontWeight: '900',
  },
  cheapestPriceBlock: {
    alignItems: 'flex-end',
  },
  cheapestStore: {
    color: '#F2FAEE',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 5,
  },
  chartLabel: {
    color: '#82917F',
    fontSize: 11,
    fontWeight: '800',
  },
  chartShell: {
    marginTop: 6,
  },
  chartToday: {
    color: '#A8FF5A',
    fontSize: 12,
    fontWeight: '900',
  },
  chartXAxis: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
  },
  safeArea: {
    flex: 1,
  },
  savingsBadge: {
    alignSelf: 'center',
    backgroundColor: '#67F38F',
    borderRadius: 999,
    color: '#101411',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: {
    color: '#F5FBF2',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 42,
  },
  searchRow: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#314137',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  searchIconButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#F3C969',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#0D120F',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryDarkButton: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#314137',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 48,
  },
  secondaryDarkButtonText: {
    color: '#E9F5E6',
    fontSize: 14,
    fontWeight: '900',
  },
  dropBadge: {
    alignItems: 'center',
    backgroundColor: '#A8FF5A',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  dropBadgeText: {
    color: '#101411',
    fontSize: 12,
    fontWeight: '900',
  },
  findDealButton: {
    alignItems: 'center',
    backgroundColor: '#A8FF5A',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  findDealButtonText: {
    color: '#101411',
    fontSize: 14,
    fontWeight: '900',
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyPanel: {
    backgroundColor: '#111A14',
    borderColor: '#26352B',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  historySubtext: {
    color: '#84927F',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  liveMatchesPanel: {
    marginBottom: 16,
  },
  matchCard: {
    backgroundColor: '#111A14',
    borderColor: '#2C452D',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  matchCountBadge: {
    alignItems: 'center',
    backgroundColor: '#A8FF5A',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  matchCountText: {
    color: '#101411',
    fontSize: 14,
    fontWeight: '900',
  },
  matchDealCopy: {
    flex: 1,
    paddingRight: 12,
  },
  matchDealMeta: {
    color: '#8E9B8C',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  matchDealName: {
    color: '#F3FAF0',
    fontSize: 14,
    fontWeight: '900',
  },
  matchDealPrice: {
    color: '#67F38F',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  matchDealRow: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    minHeight: 58,
    padding: 10,
  },
  matchDealSave: {
    color: '#F3C969',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'right',
  },
  matchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matchPriceBlock: {
    minWidth: 66,
  },
  matchTitle: {
    color: '#F7FFF3',
    fontSize: 16,
    fontWeight: '900',
  },
  miniStat: {
    backgroundColor: '#18211B',
    borderColor: '#29352D',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 62,
    padding: 10,
  },
  miniStatLabel: {
    color: '#889786',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  miniStatValue: {
    color: '#F5FBF2',
    fontSize: 16,
    fontWeight: '900',
  },
  priceStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  productActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  productBrand: {
    color: '#A8FF5A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  productDescription: {
    color: '#C8D4C4',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  productHeaderCopy: {
    flex: 1,
  },
  productInfoGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  productSheet: {
    backgroundColor: '#111713',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    padding: 18,
  },
  segmentedControl: {
    backgroundColor: '#111713',
    borderColor: '#243128',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    padding: 5,
  },
  segmentActive: {
    alignItems: 'center',
    backgroundColor: '#5EDB59',
    borderRadius: 7,
    flex: 1,
    paddingVertical: 10,
  },
  segmentActiveText: {
    color: '#101411',
    fontSize: 13,
    fontWeight: '900',
  },
  segmentInactive: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    paddingVertical: 10,
  },
  segmentInactiveText: {
    color: '#AEB9AD',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderCompact: {
    marginBottom: 2,
  },
  sectionMeta: {
    color: '#9BA899',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  sectionTitle: {
    color: '#F7FFF3',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sheet: {
    backgroundColor: '#111713',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '82%',
    padding: 18,
  },
  sheetDealCopy: {
    flex: 1,
  },
  sheetDealMeta: {
    color: '#97A593',
    fontSize: 12,
    marginTop: 4,
  },
  sheetDealName: {
    color: '#F4FBF1',
    fontSize: 15,
    fontWeight: '900',
  },
  sheetDealPrice: {
    color: '#67F38F',
    fontSize: 18,
    fontWeight: '900',
  },
  sheetDealRow: {
    alignItems: 'center',
    backgroundColor: '#18211B',
    borderColor: '#29352D',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    padding: 13,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#334039',
    borderRadius: 2,
    height: 4,
    marginBottom: 16,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetMetrics: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  sheetSectionTitle: {
    color: '#DDE8DA',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sheetSubtitle: {
    color: '#9BA899',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  sheetTitle: {
    color: '#F7FFF3',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  savingsSummaryCard: {
    backgroundColor: '#18211B',
    borderColor: '#2E3A31',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  smallChoiceChip: {
    alignItems: 'center',
    backgroundColor: '#111713',
    borderColor: '#314137',
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: 10,
  },
  smallChoiceChipActive: {
    backgroundColor: '#67F38F',
    borderColor: '#67F38F',
  },
  smallChoiceText: {
    color: '#DCE8D8',
    fontSize: 12,
    fontWeight: '900',
  },
  smallChoiceTextActive: {
    color: '#101411',
  },
  sourceRow: {
    alignItems: 'center',
    backgroundColor: '#1B271F',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    padding: 12,
  },
  sourceText: {
    color: '#C7D4C4',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryLabel: {
    color: '#A8FF5A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryMeta: {
    color: '#9BA899',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  summaryValue: {
    color: '#F7FFF3',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 6,
  },
  switchThumb: {
    backgroundColor: '#8E9B8C',
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  switchThumbActive: {
    backgroundColor: '#101411',
    transform: [{ translateX: 20 }],
  },
  switchTrack: {
    backgroundColor: '#111713',
    borderColor: '#314137',
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
    width: 48,
  },
  switchTrackActive: {
    backgroundColor: '#67F38F',
    borderColor: '#67F38F',
  },
  tabSurface: {
    paddingTop: 26,
  },
  updatedPill: {
    alignItems: 'center',
    backgroundColor: '#1B271F',
    borderColor: '#2B3B2F',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  updatedText: {
    color: '#DDE7D8',
    fontSize: 12,
    fontWeight: '900',
  },
});
