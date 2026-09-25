import { env } from '../config/env';

export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
}

/** Development stub: prints the OTP to the server console instead of sending an SMS. */
class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, otp: string) {
    console.log(`\n[sms:console] OTP for ${phone}: ${otp}\n`);
  }
}

// Add Msg91SmsProvider / TwilioSmsProvider here and select them via SMS_PROVIDER.
function create(): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'console':
    default:
      return new ConsoleSmsProvider();
  }
}

export const sms: SmsProvider = create();
