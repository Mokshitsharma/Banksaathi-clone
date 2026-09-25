import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import type { ProductType } from '@refera/shared-types';
import { errorMessage } from '../../api/client';
import { Leads } from '../../api/endpoints';
import { Button, Chip, ErrorBanner, Field } from '../../components/ui';
import type { LeadsStackParams } from '../../navigation/types';
import { colors, font, spacing } from '../../theme';
import { PRODUCT_LABEL } from '../../utils/format';

export function NewLeadScreen({ navigation }: NativeStackScreenProps<LeadsStackParams, 'NewLead'>) {
  const [productType, setProductType] = useState<ProductType>('loan');
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [dealAmount, setDealAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = leadName.trim().length >= 2 && /^[6-9]\d{9}$/.test(leadPhone);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const lead = await Leads.create({
        productType,
        leadName: leadName.trim(),
        leadPhone,
        notes: notes.trim() || undefined,
        dealAmount: dealAmount ? Number(dealAmount) : undefined,
      });
      navigation.replace('LeadDetail', { id: lead.id });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        <Text style={[font.small, { fontWeight: '600', color: colors.text, marginBottom: spacing.sm }]}>Product</Text>
        <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
          {(Object.keys(PRODUCT_LABEL) as ProductType[]).map((p) => (
            <Chip key={p} label={PRODUCT_LABEL[p]} active={productType === p} onPress={() => setProductType(p)} />
          ))}
        </View>
        <Field label="Customer name" value={leadName} onChangeText={setLeadName} autoCapitalize="words" placeholder="Full name" />
        <Field
          label="Customer mobile"
          value={leadPhone}
          onChangeText={(t) => setLeadPhone(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={10}
          placeholder="10-digit mobile number"
        />
        <Field
          label={productType === 'loan' ? 'Loan amount required (₹, optional)' : productType === 'insurance' ? 'Expected premium (₹, optional)' : 'Expected limit (₹, optional)'}
          value={dealAmount}
          onChangeText={(t) => setDealAmount(t.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
        />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline style={{ height: 90, paddingTop: spacing.md, textAlignVertical: 'top' }} />
        <Text style={[font.small, { marginBottom: spacing.lg }]}>
          Make sure the customer has agreed to be contacted by our partner team.
        </Text>
        <Button title="Submit lead" onPress={submit} loading={loading} disabled={!valid} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
