import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { errorMessage } from '../../api/client';
import { Auth, Me } from '../../api/endpoints';
import { KYC_LABEL, kycTone } from '../../components/status';
import { Badge, Button, Card, ErrorBanner, Field, Row } from '../../components/ui';
import { API_URL } from '../../config';
import { useFocusData } from '../../hooks/useAsync';
import type { ProfileStackParams } from '../../navigation/types';
import { useAuth } from '../../store/auth';
import { colors, font, spacing } from '../../theme';
import { date } from '../../utils/format';

export function ProfileScreen({ navigation }: NativeStackScreenProps<ProfileStackParams, 'Profile'>) {
  const { setUser, signOut } = useAuth();
  const { data: user, error } = useFocusData(async () => {
    const me = await Me.get();
    setUser(me);
    return me;
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit() {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setSaveError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      setUser(await Me.update({ name: name.trim() || undefined, email: email.trim() || undefined }));
      setEditing(false);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const current = user ?? useAuth.getState().user;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <ErrorBanner message={error} />
      <Card>
        {editing ? (
          <>
            <ErrorBanner message={saveError} />
            <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button title="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <Text style={font.h2}>{current?.name || 'Add your name'}</Text>
            <Row label="Mobile" value={current?.phone ?? ''} />
            <Row label="Email" value={current?.email || '—'} />
            {current && <Row label="Member since" value={date(current.createdAt)} />}
            <Button title="Edit profile" variant="secondary" onPress={startEdit} style={{ marginTop: spacing.md }} />
          </>
        )}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={font.h3}>KYC verification</Text>
          {current && <Badge label={KYC_LABEL[current.kycStatus]} tone={kycTone[current.kycStatus]} />}
        </View>
        <Text style={[font.small, { marginVertical: spacing.sm }]}>
          Aadhaar, PAN and bank verification are required to withdraw earnings.
        </Text>
        <Button
          title={current?.kycStatus === 'verified' ? 'View KYC details' : 'Continue KYC'}
          onPress={() => navigation.navigate('Kyc')}
        />
      </Card>

      <Button
        title="Log out"
        variant="danger"
        onPress={() =>
          Alert.alert('Log out?', 'You will need an OTP to sign in again.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Log out',
              style: 'destructive',
              // Revoke the token server-side first; sign out locally even if that call fails (e.g. offline).
              onPress: () => void Auth.logout().catch(() => undefined).finally(() => void signOut()),
            },
          ])
        }
      />
      <Text style={[font.small, { textAlign: 'center' }]}>Server: {API_URL}</Text>
    </ScrollView>
  );
}
