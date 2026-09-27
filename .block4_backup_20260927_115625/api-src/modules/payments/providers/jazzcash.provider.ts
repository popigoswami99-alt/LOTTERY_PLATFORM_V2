import { createHmac } from 'node:crypto';
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
 * JazzCash "Mobile Account" (MWALLET) provider.
 *
 * The MWALLET transaction type debits the customer's Jazz wallet directly: the
 * customer receives an MPIN prompt on their phone and approves it there — the
 * player never copies a transaction id. This class builds and signs that
 * request; the actual approval happens on the customer's handset, and the final
 * result arrives either synchronously in the response or via the callback.
 *
 * It is only used when PAYMENTS_MODE=live and the credentials are set;
 * otherwise the SandboxProvider stands in. The HTTP call is real, but untested
 * against production here — verify against JazzCash's own sandbox before going
 * live.
 */
export class JazzCashProvider implements PaymentProvider {
  readonly channel: PaymentChannel = 'JAZZCASH';

  private cfg() {
    const { JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT } = env;
    if (!JAZZCASH_MERCHANT_ID || !JAZZCASH_PASSWORD || !JAZZCASH_INTEGRITY_SALT) {
      throw new AppError(
        503,
        'PROVIDER_UNCONFIGURED',
        'JazzCash credentials are not configured. Set JAZZCASH_MERCHANT_ID / _PASSWORD / _INTEGRITY_SALT or run in sandbox mode.',
      );
    }
    return {
      merchantId: JAZZCASH_MERCHANT_ID,
      password: JAZZCASH_PASSWORD,
      salt: JAZZCASH_INTEGRITY_SALT,
    };
  }

  /**
   * JazzCash secure hash: HMAC-SHA256, over the integrity salt followed by every
   * non-empty pp_* field sorted by key and joined with '&'.
   */
  private secureHash(fields: Record<string, string>, salt: string): string {
    const ordered = Object.keys(fields)
      .filter((k) => k.startsWith('pp_') && fields[k] !== '')
      .sort()
      .map((k) => fields[k]);
    const message = [salt, ...ordered].join('&');
    return createHmac('sha256', salt).update(message).digest('hex').toUpperCase();
  }

  private stamp(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
      `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
  }

  async initiateDeposit(input: InitiateDepositInput): Promise<ProviderResult> {
    const { merchantId, password, salt } = this.cfg();
    if (!input.cnicLast6) {
      throw new AppError(400, 'CNIC_REQUIRED', 'JazzCash requires the last 6 digits of your CNIC');
    }

    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000);

    // JazzCash amounts are in the lowest unit as an integer with no separator.
    const fields: Record<string, string> = {
      pp_Version: '2.0',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: merchantId,
      pp_Password: password,
      pp_TxnRefNo: input.txnRef,
      pp_Amount: input.amountMinor.toString(),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: this.stamp(now),
      pp_TxnExpiryDateTime: this.stamp(expiry),
      pp_BillReference: input.txnRef,
      pp_Description: input.description,
      pp_MobileNumber: input.accountNumber,
      pp_CNIC: input.cnicLast6,
    };
    fields.pp_SecureHash = this.secureHash(fields, salt);

    const res = await fetch(env.JAZZCASH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;

    const code = body.pp_ResponseCode ?? 'ERROR';
    const message = body.pp_ResponseMessage ?? 'No response from JazzCash';
    // 000 = settled; 124/121 = pending customer approval.
    const settled = code === '000';
    const awaitingApproval = ['124', '121', '199'].includes(code);

    return {
      ok: settled || awaitingApproval,
      awaitingApproval,
      settled,
      providerRef: body.pp_RetreivalReferenceNo ?? body.pp_AuthCode,
      code,
      message,
    };
  }

  async disburse(_input: DisburseInput): Promise<ProviderResult> {
    // Disbursement uses the same signing but a payout endpoint and payload,
    // which differs per merchant agreement — wire it to your contract's spec.
    throw new AppError(
      501,
      'PAYOUT_NOT_IMPLEMENTED',
      'JazzCash live disbursement is not implemented. Complete the merchant payout integration (JAZZCASH_PAYOUT_URL) before enabling live payouts.',
    );
  }
}
