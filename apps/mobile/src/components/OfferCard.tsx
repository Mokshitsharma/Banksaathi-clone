import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import type { Offer } from '@refera/shared-types';
import type { MainTabParams } from '../navigation/types';
import { colors, font, radius, spacing } from '../theme';
import { PRODUCT_LABEL } from '../utils/format';
import { isTeamBonus, offerAmount, offerBasis, offerFallbackDescription, offerTierLabel, offerTitle } from '../utils/offers';
import { Badge, Button, Card } from './ui';

export function OfferCard({ offer, compact }: { offer: Offer; compact?: boolean }) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParams>>();
  const team = isTeamBonus(offer);

  return (
    <Card style={team ? styles.teamCard : undefined}>
      <View style={styles.header}>
        <Badge label={PRODUCT_LABEL[offer.productType]} tone={team ? 'neutral' : 'primary'} />
        <Text style={[font.small, { fontWeight: '600' }]}>{offerTierLabel(offer)}</Text>
      </View>
      <Text style={[font.h3, { marginTop: spacing.sm }]}>{offerTitle(offer)}</Text>
      <View style={styles.amountRow}>
        <Text style={[styles.amount, team && { color: colors.text }]}>{offerAmount(offer)}</Text>
        <Text style={font.small}> {offerBasis(offer)}</Text>
      </View>
      {!compact && (
        <Text style={[font.body, { color: colors.textMuted, marginBottom: spacing.md }]}>
          {offer.description || offerFallbackDescription(offer)}
        </Text>
      )}
      {!compact &&
        (team ? (
          <Button title="Invite to your team" variant="secondary" onPress={() => navigation.navigate('Referrals')} />
        ) : (
          <Button
            title="Add a lead"
            onPress={() => navigation.navigate('LeadsTab', { screen: 'NewLead', params: { productType: offer.productType } })}
          />
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' },
  amount: { fontSize: 24, fontWeight: '800', color: colors.primary },
  teamCard: { backgroundColor: '#FAFBFD', borderStyle: 'dashed', borderRadius: radius.lg },
});
