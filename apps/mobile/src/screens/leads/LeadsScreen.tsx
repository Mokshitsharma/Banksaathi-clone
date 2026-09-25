import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import type { Lead, LeadStatus } from '@refera/shared-types';
import { errorMessage } from '../../api/client';
import { Leads } from '../../api/endpoints';
import { leadTone } from '../../components/status';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, Field, Loading } from '../../components/ui';
import type { LeadsStackParams } from '../../navigation/types';
import { colors, font, spacing } from '../../theme';
import { date, LEAD_STATUS_LABEL, PRODUCT_LABEL } from '../../utils/format';
import { useFocusEffect } from '@react-navigation/native';

const FILTERS: (LeadStatus | undefined)[] = [undefined, 'new', 'contacted', 'in_progress', 'converted', 'rejected'];

export function LeadsScreen({ navigation }: NativeStackScreenProps<LeadsStackParams, 'Leads'>) {
  const [status, setStatus] = useState<LeadStatus | undefined>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const res = await Leads.list({ status, page: nextPage, search: query || undefined });
        setItems((prev) => (mode === 'more' ? [...prev, ...res.items] : res.items));
        setTotal(res.total);
        setPage(nextPage);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [status, query],
  );


  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reloads on focus, and again whenever the filter or debounced search changes.
  useFocusEffect(
    useCallback(() => {
      void load(1, 'initial');
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Field label="Search" placeholder="Name or phone" value={search} onChangeText={setSearch} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
          {FILTERS.map((f) => (
            <Chip key={f ?? 'all'} label={f ? LEAD_STATUS_LABEL[f] : 'All'} active={status === f} onPress={() => setStatus(f)} />
          ))}
        </ScrollView>
        <ErrorBanner message={error} />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 100 }}
          data={items}
          keyExtractor={(l) => l.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, 'refresh')} />}
          onEndReached={() => items.length < total && load(page + 1, 'more')}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={<EmptyState title="No leads yet" message="Add a lead or share your referral link to get started." />}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('LeadDetail', { id: item.id })}>
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{item.leadName}</Text>
                  <Text style={font.small}>
                    {PRODUCT_LABEL[item.productType]} Â· {date(item.createdAt)}
                  </Text>
                </View>
                <Badge label={LEAD_STATUS_LABEL[item.status]} tone={leadTone[item.status]} />
              </Card>
            </Pressable>
          )}
        />
      )}
      <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg }}>
        <Button title="+ Add lead" onPress={() => navigation.navigate('NewLead')} />
      </View>
    </View>
  );
}
