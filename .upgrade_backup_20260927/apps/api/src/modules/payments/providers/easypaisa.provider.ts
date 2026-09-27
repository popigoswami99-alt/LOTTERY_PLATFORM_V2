import type { PaymentChannel } from '@prisma/client';
import { env } from '../../../config/env.js';
import { AppError } from '../../../lib/errors.js';
import type {
  DisburseInput,
  InitiateDepositInput,
  PaymentProvider,
  ProviderResult,
} from './types.js';

/**
 * Easypaisa "Mobile Account" (MA) provider.
 *
 * Like JazzCash MWALLET, the MA transaction debits the customer's Easypaisa
 * account and the customer approves it on their own phone — no transaction id
 * is copied by the player. Only used when PAYMENTS_MODE=live with credentials
 * set; otherwise the SandboxProvider stands in. The request shape follows
 * Telenor's initiate-ma-transaction API and must be verified against Easypaisa's
 * own sandbox before going live.
 */
export class EasypaisaProvider implements PaymentProvider {
  readonly channel: PaymentChannel = 'EASYPAISA';

  private cfg() {
    const { EASYPAISA_STORE_ID, EASYPAISA_USERNAME, EASYPAISA_PASSWORD, EASYPAISA_ACCOUNT } = env;
    if (!EASYPAISA_STORE_ID || !EASYPAISA_USERNAME || !EASYPAISA_PASSWORD) {
      throw new AppError(
        503,
        'PROVIDER_UNCONFIGURED',
        'Easypaisa credentials are not configured. Set EASYPAISA_STORE_ID / _USERNAME / _PASSWORD or run in sandbox mode.',
      );
    }
    return {
      storeId: EASYPAISA_STORE_ID,
      username: EASYPAISA_USERNAME,
      password: EASYPAISA_PASSWORD,
      account: EASYPAISA_ACCOUNT ?? '',
    };
  }

  private amountRupees(minor: bigint): string {
    // Easypaisa amounts are in rupees with two decimals.
    const whole = minor / 100n;
    const frac = (minor % 100n).toString().padStart(2, '0');
    return `${whole}.${frac}`;
  }

  async initiateDeposit(input: InitiateDepositInput): Promise<ProviderResult> {
    const { storeId, username, password } = this.cfg();

    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    const payload = {
      orderId: input.txnRef,
      storeId,
      transactionAmount: this.amountRupees(input.amountMinor),
      transactionType: 'MA',
      mobileAccountNo: input.accountNumber,
      emailAddress: '',
    };

    const res = await fetch(env.EASYPAISA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Credentials: credentials,
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;

    const code = body.responseCode ?? 'ERROR';
    const message = body.responseDesc ?? 'No response from Easypaisa';
    // 0000 = success; 0001/pending → customer approval on their handset.
    const settled = code === '0000';
    const awaitingApproval = ['0001', '0002', 'PENDING'].includes(code);

    return {
      ok: settled || awaitingApproval,
      awaitingApproval,
      settled,
      providerRef: body.transactionId,
      code,
      message,
    };
  }

  async disburse(_input: DisburseInput): Promise<ProviderResult> {
    throw new AppError(
      501,
      'PAYOUT_NOT_IMPLEMENTED',
      'Easypaisa live disbursement is not implemented. Complete the merchant payout integration before enabling live payouts.',
    );
  }
}
