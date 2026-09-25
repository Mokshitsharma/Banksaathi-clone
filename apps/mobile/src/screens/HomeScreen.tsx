import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Earnings, Leads } from '../api/endpoints';
import { KYC_LABEL, kycTone, leadTone } from '../components/status';
import { Badge, Button, Card, ErrorBanner } from '../components/ui';
import { useFocusData } from '../hooks/useAsync';
import type { MainTabParams } from '../navigation/types';
import { useAuth } from '../store/auth';
import { colors, font, radius, spacing } from '../theme';
import { LEAD_STATUS_LABEL, money } from '../utils/format';
import type { LeadStatus } from '@refera/shared-types';

export function HomeScreen({ navigation }: BottomTabScreenProps<MainTabParams, 'Home'>) {
  const user = useAuth((s) => s.user);
  const { data, error, refreshing, reload } = useFocusData(async () => {
    const [summary, stats] = await Promise.all([Earnings.summary(), Leads.stats()]);
    return { summary, stats };
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
        <Text style={font.small}>Welcome back</Text>
        <Text style={font.h1}>{user?.name || 'Partner'}</Text>
        <ErrorBanner message={error} />

        <View style={styles.hero}>
          <Text style={{ color: '#C7D7FF', fontSize: 13 }}>Available to withdraw</Text>
          <Text style={styles.heroAmount}>{money(data?.summary.availableBalancePaise)}</Text>
          <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Pending approval</Text>
              <Text style={styles.heroValue}>{money(data?.summary.pendingPaise)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Total earned</Text>
              <Text style={styles.heroValue}>{money(data?.summary.totalEarnedPaise)}</Text>
            </View>
          </View>
        </View>

        {user && user.kycStatus !== 'verified' && (
          <Pressable onPress={() => navigation.navigate('ProfileTab')}>
            <Card style={{ marginBottom: spacing.lg, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>Complete your KYC</Text>
                <Text style={font.small}>Required before you can withdraw earnings.</Text>
              </View>
              <Badge label={KYC_LABEL[user.kycStatus]} tone={kycTone[user.kycStatus]} />
            </Card>
          </Pressable>
        )}

        <Text style={[font.h3, { marginBottom: spacing.md }]}>Your leads</Text>
        <View style={styles.grid}>
          {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
            <Card key={s} style={styles.statCard}>
              <Text style={font.h2}>{data?.stats[s] ?? 0}</Text>
              <Badge label={LEAD_STATUS_LABEL[s]} tone={leadTone[s]} />
            </Card>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <Button title="Add a lead" style={{ flex: 1 }} onPress={() => navigation.navigate('LeadsTab', { screen: 'NewLead' } as never)} />
          <Button title="Share link" variant="secondary" style={{ flex: 1 }} onPress={() => navigation.navigate('Referrals')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.xl, marginVertical: spacing.lg },
  heroAmount: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: spacing.xs },
  heroLabel: { color: '#C7D7FF', fontSize: 12 },
  heroValue: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: { width: '30%', flexGrow: 1, gap: spacing.sm, padding: spacing.md },
});
