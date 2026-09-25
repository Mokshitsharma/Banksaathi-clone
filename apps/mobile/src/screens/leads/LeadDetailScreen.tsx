import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, ScrollView, Text, View } from 'react-native';
import type { LeadStatus } from '@refera/shared-types';
import { Leads } from '../../api/endpoints';
import { commissionTone, leadTone } from '../../components/status';
import { Badge, Button, Card, ErrorBanner, Loading, Row } from '../../components/ui';
import { useFocusData } from '../../hooks/useAsync';
import type { LeadsStackParams } from '../../navigation/types';
import { colors, font, spacing } from '../../theme';
import { dateTime, LEAD_STATUS_LABEL, money, PRODUCT_LABEL } from '../../utils/format';

const PIPELINE: LeadStatus[] = ['new', 'contacted', 'in_progress', 'converted'];

export function LeadDetailScreen({ route }: NativeStackScreenProps<LeadsStackParams, 'LeadDetail'>) {
  const { data: lead, error } = useFocusData(() => Leads.get(route.params.id));

  if (!lead) return error ? <View style={{ padding: spacing.lg }}><ErrorBanner message={error} /></View> : <Loading />;

  const reached = lead.status === 'rejected' ? -1 : PIPELINE.indexOf(lead.status);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{lead.leadName}</Text>
            <Text style={font.small}>{PRODUCT_LABEL[lead.productType]}</Text>
          </View>
          <Badge label={LEAD_STATUS_LABEL[lead.status]} tone={leadTone[lead.status]} />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Row label="Phone" value={lead.leadPhone} />
          {lead.dealAmountPaise != null && <Row label="Deal amount" value={money(lead.dealAmountPaise)} />}
          <Row label="Created" value={dateTime(lead.createdAt)} />
          <Row label="Last update" value={dateTime(lead.updatedAt)} />
        </View>
        {lead.notes ? <Text style={[font.small, { marginTop: spacing.sm }]}>{lead.notes}</Text> : null}
        <Button title="Call lead" variant="secondary" style={{ marginTop: spacing.md }} onPress={() => Linking.openURL(`tel:${lead.leadPhone}`)} />
      </Card>

      <Card>
        <Text style={[font.h3, { marginBottom: spacing.md }]}>Progress</Text>
        {lead.status === 'rejected' ? (
          <Text style={{ color: colors.danger }}>This lead was not converted.</Text>
        ) : (
          PIPELINE.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  marginRight: spacing.md,
                  backgroundColor: i <= reached ? colors.success : colors.border,
                }}
              />
              <Text style={[font.body, i > reached && { color: colors.textMuted }]}>{LEAD_STATUS_LABEL[s]}</Text>
            </View>
          ))
        )}
      </Card>

      {lead.commissions.length > 0 && (
        <Card>
          <Text style={[font.h3, { marginBottom: spacing.sm }]}>Your commission</Text>
          {lead.commissions.map((c) => (
            <Row key={c.id} label={`Tier ${c.tier}`} value={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={font.h3}>{money(c.amountPaise)}</Text>
                <Badge label={c.status} tone={commissionTone[c.status]} />
              </View>
            } />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
