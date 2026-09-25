export type AuthStackParams = {
  Phone: undefined;
  Otp: { phone: string };
};

export type MainTabParams = {
  Home: undefined;
  Referrals: undefined;
  LeadsTab: undefined;
  Earnings: undefined;
  ProfileTab: undefined;
};

export type LeadsStackParams = {
  Leads: undefined;
  LeadDetail: { id: string };
  NewLead: undefined;
};

export type ProfileStackParams = {
  Profile: undefined;
  Kyc: undefined;
};
