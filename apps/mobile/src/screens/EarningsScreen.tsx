import { useState } from 'react';
import { Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Commission, LedgerEntry, Payout } from '@refera/shared-types';
import { errorMessage } from '../api/client';
import { Earnings } from '../api/endpoints';
import { commissionTone, payoutTone } from '../components/status';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, Field } from '../components/ui';
import { useFocusData } from '../hooks/useAsync';
import { useAuth } from '../store/auth';
import { colors, font, spacing } from '../theme';
import { dateTime, money, PRODUCT_LABEL } from '../utils/format';

type Tab = 'ledger' | 'commissions' | 'payouts';
type Item = LedgerEntry | Commission | Payout;

const LEDGER_LABEL: Record<LedgerEntry['type'], string> = {
  commission_credit: 'Commission credited',
  payout_debit: 'Payout',
  payout_reversal: 'Payout reversed',
};

export function EarningsScreen() {
  const kycStatus = useAuth((s) => s.user?.kycStatus);
  const [tab, setTab] = useState<Tab>('ledger');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { data, error, refreshing, reload } = useFocusData(async () => {
    const [summary, ledger, commissions, payouts] = await Promise.all([
      Earnings.summary(),
      Earnings.ledger(),
      Earnings.commissions(),
      Earnings.payouts(),
    ]);
    return { summary, ledger: ledger.items, commissions: commissions.items, payouts: payouts.items };
  });

  const list: Item[] = data ? data[tab] : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FlatList<Item>
        contentContainerStyle={{ padding: spacing.lg }}
        data={list}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View>
            <Text style={[font.h1, { marginBottom: spacing.lg }]}>Earnings</Text>
            <ErrorBanner message={error} />
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={font.small}>Available balance</Text>
              <Text style={styles.balance}>{money(data?.summary.availableBalancePaise)}</Text>
              <View style={styles.statsRow}>
                <Stat label="Pending" value={money(data?.summary.pendingPaise)} />
                <Stat label="Paid out" value={money(data?.summary.paidPaise)} />
                <Stat label="In process" value={money(data?.summary.inProcessPayoutPaise)} />
              </View>
              <Button
                title="Withdraw"
                style={{ marginTop: spacing.lg }}
                disabled={!data || data.summary.availableBalancePaise < data.summary.minPayoutPaise}
                onPress={() =>
                  kycStatus === 'verified'
                    ? setWithdrawOpen(true)
                    : Alert.alert('KYC required', 'Complete KYC verification from your Profile before withdrawing.')
                }
              />
              {data && data.summary.availableBalancePaise < data.summary.minPayoutPaise ? (
                <Text style={[font.small, { marginTop: spacing.sm, textAlign: 'center' }]}>
                  Minimum withdrawal is {money(data.summary.minPayoutPaise)}
                </Text>
              ) : null}
            </Card>
            <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
              <Chip label="History" active={tab === 'ledger'} onPress={() => setTab('ledger')} />
              <Chip label="Commissions" active={tab === 'commissions'} onPress={() => setTab('commissions')} />
              <Chip label="Payouts" active={tab === 'payouts'} onPress={() => setTab('payouts')} />
            </View>
          </View>
        }
        ListEmptyComponent={data ? <EmptyState title="Nothing here yet" message="Earnings appear once your leads convert." /> : null}
        renderItem={({ item }) => <EarningRow tab={tab} item={item} />}
      />
      <WithdrawModal
        visible={withdrawOpen}
        maxPaise={data?.summary.availableBalancePaise ?? 0}
        minPaise={data?.summary.minPayoutPaise ?? 0}
        onClose={() => setWithdrawOpen(false)}
        onDone={() => {
          setWithdrawOpen(false);
          void reload();
        }}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={font.small}>{label}</Text>
      <Text style={[font.body, { fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}

function EarningRow({ tab, item }: { tab: Tab; item: Item }) {
  if (tab === 'ledger') {
    const e = item as LedgerEntry;
    return (
      <Card style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{LEDGER_LABEL[e.type]}</Text>
          <Text style={font.small} numberOfLines={1}>{e.description ?? ''}</Text>
          <Text style={font.small}>{dateTime(e.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[font.h3, { color: e.amountPaise >= 0 ? colors.success : colors.text }]}>
            {e.amountPaise >= 0 ? '+' : '−'}
            {money(Math.abs(e.amountPaise))}
          </Text>
          <Text style={font.small}>Bal {money(e.balanceAfterPaise)}</Text>
        </View>
      </Card>
    );
  }
  if (tab === 'commissions') {
    const c = item as Commission;
    return (
      <Card style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{c.lead?.leadName ?? 'Lead'}</Text>
          <Text style={font.small}>
            {c.lead ? PRODUCT_LABEL[c.lead.productType] : ''} · Tier {c.tier} · {dateTime(c.createdAt)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={font.h3}>{money(c.amountPaise)}</Text>
          <Badge label={c.status} tone={commissionTone[c.status]} />
        </View>
      </Card>
    );
  }
  const p = item as Payout;
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={font.h3}>{money(p.amountPaise)}</Text>
        <Text style={font.small}>{dateTime(p.createdAt)}</Text>
        {p.transactionRef ? <Text style={font.small}>Ref: {p.transactionRef}</Text> : null}
        {p.failureReason ? <Text style={[font.small, { color: colors.danger }]}>{p.failureReason}</Text> : null}
      </View>
      <Badge label={p.status} tone={payoutTone[p.status]} />
    </Card>
  );
}

function WithdrawModal({ visible, maxPaise, minPaise, onClose, onDone }: {
  visible: boolean;
  maxPaise: number;
  minPaise: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paise = Math.round(Number(amount || 0) * 100);
  const valid = paise >= minPaise && paise <= maxPaise;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await Earnings.requestPayout(Number(amount));
      setAmount('');
      Alert.alert('Payout requested', 'We will transfer it to your verified bank account shortly.');
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={[font.h2, { marginBottom: spacing.lg }]}>Withdraw earnings</Text>
          <ErrorBanner message={error} />
          <Field
            label="Amount (₹)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))}
            hint={`Available ${money(maxPaise)} · minimum ${money(minPaise)}`}
            autoFocus
          />
          <Button title="Request payout" onPress={submit} loading={loading} disabled={!valid} />
          <Button title="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.sm }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  balance: { fontSize: 32, fontWeight: '800', color: colors.text, marginVertical: spacing.xs },
  statsRow: { flexDirection: 'row', marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, maxHeight: '80%' },
});
