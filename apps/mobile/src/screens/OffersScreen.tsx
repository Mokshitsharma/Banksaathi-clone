import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { Offer, ProductType } from '@refera/shared-types';
import { Offers } from '../api/endpoints';
import { OfferCard } from '../components/OfferCard';
import { Chip, EmptyState, ErrorBanner, Loading } from '../components/ui';
import { useFocusData } from '../hooks/useAsync';
import { colors, font, spacing } from '../theme';
import { PRODUCT_LABEL } from '../utils/format';
import { isTeamBonus } from '../utils/offers';

export function OffersScreen() {
  const [product, setProduct] = useState<ProductType | undefined>();
  const { data, error, refreshing, reload } = useFocusData(() => Offers.list());

  if (!data) return error ? <View style={{ padding: spacing.lg }}><ErrorBanner message={error} /></View> : <Loading />;

  const visible = data.filter((o) => !product || o.productType === product);
  const direct = visible.filter((o) => !isTeamBonus(o));
  const team = visible.filter(isTeamBonus);
  const products = [...new Set(data.map((o) => o.productType))];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
    >
      <ErrorBanner message={error} />
      {products.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="All" active={!product} onPress={() => setProduct(undefined)} />
          {products.map((p) => (
            <Chip key={p} label={PRODUCT_LABEL[p]} active={product === p} onPress={() => setProduct(p)} />
          ))}
        </ScrollView>
      )}

      {visible.length === 0 && <EmptyState title="No offers right now" message="Check back soon for new ways to earn." />}

      <Section title="Refer & earn" offers={direct} />
      <Section title="Team bonuses" subtitle="Earn when people you invited convert their leads." offers={team} />
    </ScrollView>
  );
}

function Section({ title, subtitle, offers }: { title: string; subtitle?: string; offers: Offer[] }) {
  if (offers.length === 0) return null;
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
      <View>
        <Text style={font.h2}>{title}</Text>
        {subtitle && <Text style={font.small}>{subtitle}</Text>}
      </View>
      {offers.map((o) => (
        <OfferCard key={o.id} offer={o} />
      ))}
    </View>
  );
}
