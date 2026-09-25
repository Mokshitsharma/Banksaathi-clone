import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from '../../api/client';
import { Auth } from '../../api/endpoints';
import { Button, ErrorBanner, Field } from '../../components/ui';
import type { AuthStackParams } from '../../navigation/types';
import { colors, font, spacing } from '../../theme';

export function PhoneScreen({ navigation }: NativeStackScreenProps<AuthStackParams, 'Phone'>) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[6-9]\d{9}$/.test(phone);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await Auth.sendOtp(phone);
      navigation.navigate('Otp', { phone });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Text style={styles.logoText}>R</Text>
          </View>
          <Text style={font.h1}>Welcome to Refera</Text>
          <Text style={[font.small, { marginTop: spacing.sm, marginBottom: spacing.xxl, fontSize: 15 }]}>
            Refer friends to loans, credit cards and insurance — earn on every successful conversion.
          </Text>
          <ErrorBanner message={error} />
          <Field
            label="Mobile number"
            placeholder="10-digit mobile number"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
            hint="We'll send a 6-digit OTP to this number"
            autoFocus
          />
          <Button title="Get OTP" onPress={submit} loading={loading} disabled={!valid} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing.xxl * 2 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logoText: { color: '#fff', fontSize: 28, fontWeight: '800' },
});
