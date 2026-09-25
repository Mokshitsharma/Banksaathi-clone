import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { FlatList, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Referrals } from '../api/endpoints';
import { KYC_LABEL, kycTone } from '../components/status';
import { Badge, Button, Card, EmptyState, ErrorBanner } from '../components/ui';
import { useFocusData } from '../hooks/useAsync';
import { colors, font, radius, spacing } from '../theme';
import { date } from '../utils/format';

export function ReferralsScreen() {
  const [copied, setCopied] = useState(false);
  const { data, error, refreshing, reload } = useFocusData(async () => {
    const [link, downline] = await Promise.all([Referrals.link(), Referrals.downline(3)]);
    return { link, downline };
  });

  async function share() {
    if (!data) return;
    await Share.share({
      message: `Join me on Refera and earn by referring friends to loans, credit cards and insurance. Use my code ${data.link.code}: ${data.link.url}`,
    });
  }

  async function copy() {
    if (!data) return;
    await Clipboard.setStringAsync(data.link.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const header = (
    <View>
      <Text style={[font.h1, { marginBottom: spacing.lg }]}>Refer & grow</Text>
      <ErrorBanner message={error} />
      <Card style={{ marginBottom: spacing.xl }}>
        <Text style={font.small}>Your referral code</Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{data?.link.code ?? '········'}</Text>
        </View>
        <Text style={[font.small, { marginBottom: spacing.lg }]} numberOfLines={1}>
          {data?.link.url}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="Share" onPress={share} style={{ flex: 1 }} disabled={!data} />
          <Button title={copied ? 'Copied!' : 'Copy code'} variant="secondary" onPress={copy} style={{ flex: 1 }} disabled={!data} />
        </View>
      </Card>
      <Text style={font.h3}>Your team</Text>
      <Text style={[font.small, { marginBottom: spacing.md }]}>
        {data
          ? Object.entries(data.downline.counts)
              .map(([lvl, n]) => `Level ${lvl}: ${n}`)
              .join('  ·  ') || 'Partners who join with your code appear here'
          : ' '}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg }}
        data={data?.downline.members ?? []}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
        ListEmptyComponent={data ? <EmptyState title="No team members yet" message="Share your code to build your team." /> : null}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={font.h3}>{item.name || item.phone}</Text>
              <Text style={font.small}>
                Level {item.level} · joined {date(item.createdAt)} · {item.leadsCount} leads
              </Text>
            </View>
            <Badge label={KYC_LABEL[item.kycStatus]} tone={kycTone[item.kycStatus]} />
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  codeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 4, color: colors.primaryDark },
});
