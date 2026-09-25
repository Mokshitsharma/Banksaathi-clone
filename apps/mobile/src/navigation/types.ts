import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ProductType } from '@refera/shared-types';

export type AuthStackParams = {
  Phone: undefined;
  Otp: { phone: string };
};

export type HomeStackParams = {
  HomeMain: undefined;
  Offers: undefined;
};

export type LeadsStackParams = {
  Leads: undefined;
  LeadDetail: { id: string };
  NewLead: { productType?: ProductType } | undefined;
};

export type ProfileStackParams = {
  Profile: undefined;
  Kyc: undefined;
};

export type MainTabParams = {
  Home: NavigatorScreenParams<HomeStackParams> | undefined;
  Referrals: undefined;
  LeadsTab: NavigatorScreenParams<LeadsStackParams> | undefined;
  Earnings: undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParams> | undefined;
};
