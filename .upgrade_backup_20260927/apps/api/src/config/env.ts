import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CURRENCY: z.string().default('INR'),

  // --- Payments (JazzCash / Easypaisa) -------------------------------------
  // 'sandbox' runs the whole deposit/withdraw flow against a simulated
  // provider — the customer approves with an MPIN in-app and the wallet is
  // credited, with no real money and no credentials. Switch to 'live' only
  // after the merchant credentials below are filled in and tested against the
  // providers' own sandboxes.
  PAYMENTS_MODE: z.enum(['sandbox', 'live']).default('sandbox'),

  /// Bonus granted on every successful deposit, in basis points (500 = 5%).
  DEPOSIT_BONUS_BPS: z.coerce.number().min(0).max(10000).default(500),

  /// Guard rails, in minor units (paise). Defaults: ₹100 min deposit, ₹150 min
  /// withdrawal.
  MIN_DEPOSIT_MINOR: z.coerce.bigint().default(10000n),
  MIN_WITHDRAW_MINOR: z.coerce.bigint().default(15000n),

  // Merchant credentials — only needed in 'live' mode. Left optional so the
  // app boots in sandbox with none of them set.
  JAZZCASH_MERCHANT_ID: z.string().optional(),
  JAZZCASH_PASSWORD: z.string().optional(),
  JAZZCASH_INTEGRITY_SALT: z.string().optional(),
  JAZZCASH_API_URL: z
    .string()
    .default(
      'https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction',
    ),
  JAZZCASH_PAYOUT_URL: z.string().optional(),

  EASYPAISA_STORE_ID: z.string().optional(),
  EASYPAISA_ACCOUNT: z.string().optional(),
  EASYPAISA_USERNAME: z.string().optional(),
  EASYPAISA_PASSWORD: z.string().optional(),
  EASYPAISA_API_URL: z
    .string()
    .default('https://easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
