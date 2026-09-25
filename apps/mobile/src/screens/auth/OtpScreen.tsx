import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text } from 'react-native';
import { errorMessage } from '../../api/client';
import { Auth } from '../../api/endpoints';
import { Button, ErrorBanner, Field } from '../../components/ui';
import type { AuthStackParams } from '../../navigation/types';
import { useAuth } from '../../store/auth';
import { colors, font, spacing } from '../../theme';

const RESEND_SECONDS = 30;

export function OtpScreen({ route }: NativeStackScreenProps<AuthStackParams, 'Otp'>) {
  const { phone } = route.params;
  const signIn = useAuth((s) => s.signIn);
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [showReferral, setShowReferral] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    setReferrerName(null);
    if (referralCode.length < 6) return;
    const t = setTimeout(() => {
      Auth.checkReferralCode(referralCode)
        .then((r) => setReferrerName(r.referrerName ?? 'a Refera partner'))
        .catch(() => setReferrerName(null));
    }, 400);
    return () => clearTimeout(t);
  }, [referralCode]);

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const res = await Auth.verifyOtp({
        phone,
        otp,
        name: name.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
      });
      await signIn(res.token, res.user);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await Auth.sendOtp(phone);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Text style={font.h2}>Enter OTP</Text>
        <Text style={[font.small, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>Sent to +91 {phone}</Text>
        <ErrorBanner message={error} />
        <Field
          label="OTP"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={(t) => setOtp(t.replace(/\D/g, ''))}
          autoFocus
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          style={{ letterSpacing: 8, fontSize: 20 }}
        />
        <Field label="Your name (new users)" placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" />

        {showReferral ? (
          <Field
            label="Referral code (optional)"
            placeholder="e.g. AB12CD34"
            autoCapitalize="characters"
            value={referralCode}
            onChangeText={(t) => setReferralCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={16}
            hint={referrerName ? `Invited by ${referrerName}` : 'Only applies when creating a new account'}
          />
        ) : (
          <Pressable onPress={() => setShowReferral(true)} style={{ marginBottom: spacing.lg }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Have a referral code?</Text>
          </Pressable>
        )}

        <Button title="Verify & continue" onPress={verify} loading={loading} disabled={otp.length < 4} />
        <Pressable onPress={resend} disabled={cooldown > 0} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: cooldown > 0 ? colors.textMuted : colors.primary, fontWeight: '600' }}>
            {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
