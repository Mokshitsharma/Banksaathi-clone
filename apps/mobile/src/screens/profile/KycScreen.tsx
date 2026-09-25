import * as DocumentPicker from 'expo-document-picker';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { KycDocumentType, KycState } from '@refera/shared-types';
import { errorMessage } from '../../api/client';
import { Kyc, Me } from '../../api/endpoints';
import { KYC_LABEL, kycTone } from '../../components/status';
import { Badge, Button, Card, ErrorBanner, Field, Loading, Row } from '../../components/ui';
import { useFocusData } from '../../hooks/useAsync';
import { useAuth } from '../../store/auth';
import { colors, font, spacing } from '../../theme';
import { date } from '../../utils/format';

const DOC_LABEL: Record<KycDocumentType, string> = { pan_card: 'PAN card', bank_proof: 'Bank proof', other: 'Other' };

export function KycScreen() {
  const setUser = useAuth((s) => s.setUser);
  const { data: kyc, setData, error } = useFocusData(() => Kyc.get());

  async function applyState(next: KycState) {
    setData(next);
    // Keep the cached user's kycStatus in sync (Home banner, withdraw gate).
    setUser(await Me.get());
  }

  if (!kyc) return error ? <View style={{ padding: spacing.lg }}><ErrorBanner message={error} /></View> : <Loading />;

  const locked = kyc.kycStatus === 'verified' || kyc.kycStatus === 'pending';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={font.h3}>Status</Text>
            <Badge label={KYC_LABEL[kyc.kycStatus]} tone={kycTone[kyc.kycStatus]} />
          </View>
          {kyc.kycStatus === 'pending' && (
            <Text style={[font.small, { marginTop: spacing.sm }]}>All checks passed. Our team is reviewing your details.</Text>
          )}
          {kyc.kycStatus === 'rejected' && kyc.rejectionReason && (
            <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{kyc.rejectionReason}. Please redo the steps below.</Text>
          )}
        </Card>

        <AadhaarStep done={kyc.aadhaarVerified} locked={locked} onVerified={applyState} />
        <PanStep done={kyc.panVerified} masked={kyc.panMasked} locked={locked} onVerified={applyState} />
        <BankStep done={kyc.bankVerified} masked={kyc.bankAccountMasked} ifsc={kyc.bankIfsc} locked={locked} onVerified={applyState} />
        <DocumentsStep kyc={kyc} disabled={kyc.kycStatus === 'verified'} onUploaded={async () => setData(await Kyc.get())} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ index, title, done, children }: { index: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: done ? colors.success : colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.md,
          }}
        >
          <Text style={{ color: done ? '#fff' : colors.primary, fontWeight: '700' }}>{done ? '✓' : index}</Text>
        </View>
        <Text style={[font.h3, { flex: 1 }]}>{title}</Text>
        {done && <Badge label="Verified" tone="success" />}
      </View>
      {children}
    </Card>
  );
}

function useSubmit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return { loading, error, run };
}

function AadhaarStep({ done, locked, onVerified }: { done: boolean; locked: boolean; onVerified: (s: KycState) => Promise<void> }) {
  const [aadhaar, setAadhaar] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const { loading, error, run } = useSubmit();

  return (
    <Step index={1} title="Aadhaar eKYC" done={done}>
      {done ? (
        <Text style={font.small}>Verified via Aadhaar OTP. Your Aadhaar number is never stored.</Text>
      ) : locked ? null : (
        <>
          <ErrorBanner message={error} />
          {!otpSent ? (
            <>
              <Field
                label="Aadhaar number"
                keyboardType="number-pad"
                maxLength={12}
                value={aadhaar}
                onChangeText={(t) => setAadhaar(t.replace(/\D/g, ''))}
                hint="An OTP will be sent to your Aadhaar-linked mobile"
              />
              <Button
                title="Send OTP"
                loading={loading}
                disabled={aadhaar.length !== 12}
                onPress={() =>
                  run(async () => {
                    await Kyc.aadhaarOtp(aadhaar);
                    setAadhaar('');
                    setOtpSent(true);
                  })
                }
              />
            </>
          ) : (
            <>
              <Field label="Aadhaar OTP" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, ''))} autoFocus />
              <Button title="Verify" loading={loading} disabled={otp.length < 4} onPress={() => run(async () => onVerified(await Kyc.aadhaarVerify(otp)))} />
              <Button title="Change Aadhaar number" variant="ghost" onPress={() => setOtpSent(false)} />
            </>
          )}
        </>
      )}
    </Step>
  );
}

function PanStep({ done, masked, locked, onVerified }: { done: boolean; masked: string | null; locked: boolean; onVerified: (s: KycState) => Promise<void> }) {
  const [pan, setPan] = useState('');
  const [name, setName] = useState('');
  const { loading, error, run } = useSubmit();
  const valid = /^[A-Z]{5}\d{4}[A-Z]$/.test(pan);

  return (
    <Step index={2} title="PAN verification" done={done}>
      {done ? (
        <Row label="PAN" value={masked ?? ''} />
      ) : locked ? null : (
        <>
          <ErrorBanner message={error} />
          <Field label="PAN" autoCapitalize="characters" maxLength={10} value={pan} onChangeText={(t) => setPan(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE1234F" />
          <Field label="Name as on PAN" value={name} onChangeText={setName} autoCapitalize="characters" />
          <Button title="Verify PAN" loading={loading} disabled={!valid} onPress={() => run(async () => onVerified(await Kyc.pan(pan, name.trim() || undefined)))} />
        </>
      )}
    </Step>
  );
}

function BankStep({ done, masked, ifsc, locked, onVerified }: {
  done: boolean;
  masked: string | null;
  ifsc: string | null;
  locked: boolean;
  onVerified: (s: KycState) => Promise<void>;
}) {
  const [account, setAccount] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ifscInput, setIfsc] = useState('');
  const { loading, error, run } = useSubmit();
  const valid = /^\d{9,18}$/.test(account) && account === confirm && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscInput);

  return (
    <Step index={3} title="Bank account" done={done}>
      {done ? (
        <>
          <Row label="Account" value={masked ?? ''} />
          <Row label="IFSC" value={ifsc ?? ''} />
        </>
      ) : locked ? null : (
        <>
          <ErrorBanner message={error} />
          <Field label="Account number" keyboardType="number-pad" secureTextEntry value={account} onChangeText={(t) => setAccount(t.replace(/\D/g, ''))} />
          <Field
            label="Confirm account number"
            keyboardType="number-pad"
            value={confirm}
            onChangeText={(t) => setConfirm(t.replace(/\D/g, ''))}
            error={confirm && confirm !== account ? "Account numbers don't match" : undefined}
          />
          <Field label="IFSC" autoCapitalize="characters" maxLength={11} value={ifscInput} onChangeText={(t) => setIfsc(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="HDFC0001234" />
          <Text style={[font.small, { marginBottom: spacing.md }]}>We'll verify the account with a ₹1 penny-drop.</Text>
          <Button title="Verify bank account" loading={loading} disabled={!valid} onPress={() => run(async () => onVerified(await Kyc.bank(account, ifscInput)))} />
        </>
      )}
    </Step>
  );
}

function DocumentsStep({ kyc, disabled, onUploaded }: { kyc: KycState; disabled: boolean; onUploaded: () => Promise<void> }) {
  const { loading, error, run } = useSubmit();

  function pick(type: KycDocumentType) {
    return run(async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 5 * 1024 * 1024) throw new Error('File must be 5 MB or smaller');
      await Kyc.uploadDocument(type, { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream' });
      await onUploaded();
    });
  }

  return (
    <Step index={4} title="Supporting documents" done={kyc.documents.length > 0}>
      <ErrorBanner message={error} />
      {kyc.documents.map((d) => (
        <Pressable key={d.id} onPress={() => d.url && Linking.openURL(d.url)}>
          <Row label={DOC_LABEL[d.type]} value={<Text style={{ color: colors.primary }}>{d.fileName} · {date(d.createdAt)}</Text>} />
        </Pressable>
      ))}
      {!disabled && (
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
          <Button title="Upload PAN card" variant="secondary" loading={loading} onPress={() => pick('pan_card')} style={{ flex: 1 }} />
          <Button title="Bank proof" variant="secondary" loading={loading} onPress={() => pick('bank_proof')} style={{ flex: 1 }} />
        </View>
      )}
      <Text style={[font.small, { marginTop: spacing.sm }]}>JPG, PNG or PDF up to 5 MB. Stored privately and encrypted.</Text>
    </Step>
  );
}
