import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { registerForPush } from '../notifications';
import { OtpScreen } from '../screens/auth/OtpScreen';
import { PhoneScreen } from '../screens/auth/PhoneScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { OffersScreen } from '../screens/OffersScreen';
import { LeadDetailScreen } from '../screens/leads/LeadDetailScreen';
import { LeadsScreen } from '../screens/leads/LeadsScreen';
import { NewLeadScreen } from '../screens/leads/NewLeadScreen';
import { KycScreen } from '../screens/profile/KycScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ReferralsScreen } from '../screens/ReferralsScreen';
import { Loading } from '../components/ui';
import { useAuth } from '../store/auth';
import { colors } from '../theme';
import type { AuthStackParams, HomeStackParams, LeadsStackParams, MainTabParams, ProfileStackParams } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const Tabs = createBottomTabNavigator<MainTabParams>();
const HomeStack = createNativeStackNavigator<HomeStackParams>();
const LeadsStack = createNativeStackNavigator<LeadsStackParams>();
const ProfileStack = createNativeStackNavigator<ProfileStackParams>();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.bg } };

function HomeNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Offers" component={OffersScreen} options={{ title: 'Offers' }} />
    </HomeStack.Navigator>
  );
}

function LeadsNavigator() {
  return (
    <LeadsStack.Navigator>
      <LeadsStack.Screen name="Leads" component={LeadsScreen} options={{ title: 'My leads' }} />
      <LeadsStack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ title: 'Lead' }} />
      <LeadsStack.Screen name="NewLead" component={NewLeadScreen} options={{ title: 'New lead', presentation: 'modal' }} />
    </LeadsStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Kyc" component={KycScreen} options={{ title: 'KYC verification' }} />
    </ProfileStack.Navigator>
  );
}

const TAB_ICON: Record<keyof MainTabParams, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Referrals: 'people-outline',
  LeadsTab: 'list-outline',
  Earnings: 'wallet-outline',
  ProfileTab: 'person-circle-outline',
};

function MainTabs() {
  useEffect(() => {
    void registerForPush();
  }, []);

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICON[route.name]} color={color} size={size} />,
      })}
    >
      <Tabs.Screen name="Home" component={HomeNavigator} />
      <Tabs.Screen name="Referrals" component={ReferralsScreen} options={{ title: 'Refer' }} />
      <Tabs.Screen name="LeadsTab" component={LeadsNavigator} options={{ title: 'Leads' }} />
      <Tabs.Screen name="Earnings" component={EarningsScreen} />
      <Tabs.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'Profile' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { hydrated, token, hydrate } = useAuth();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return <Loading />;

  return (
    <NavigationContainer theme={theme}>
      {token ? (
        <MainTabs />
      ) : (
        <AuthStack.Navigator>
          <AuthStack.Screen name="Phone" component={PhoneScreen} options={{ headerShown: false }} />
          <AuthStack.Screen name="Otp" component={OtpScreen} options={{ title: 'Verify' }} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
