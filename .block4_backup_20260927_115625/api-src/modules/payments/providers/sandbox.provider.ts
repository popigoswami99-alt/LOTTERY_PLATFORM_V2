import type { PaymentChannel } from '@prisma/client';
import type {
  DisburseInput,
  InitiateDepositInput,
  PaymentProvider,
  ProviderResult,
} from './types.js';

/**
 * Sandbox provider. Simulates the mobile-wallet flow end to end without any
 * real credentials or money:
 *
 *   - initiateDeposit "sends" an MPIN request to the customer's wallet and
 *     returns AWAITING_APPROVAL. The approval itself is simulated by the
 *     /deposit/:id/confirm endpoint (the player entering their MPIN in-app).
 *   - disburse settles immediately.
 *
 * This is what makes the whole feature testable locally. The real providers
 * behave the same way from the caller's point of view.
 */
export class SandboxProvider implements PaymentProvider {
  constructor(public readonly channel: PaymentChannel) {}

  async initiateDeposit(input: InitiateDepositInput): Promise<ProviderResult> {
    return {
      ok: true,
      awaitingApproval: true,
      settled: false,
      providerRef: `SBX-${this.channel}-${input.txnRef}`,
      code: 'PENDING',
      message: `A payment request was sent to ${this.channel} wallet ${input.accountNumber}. Approve with your MPIN.`,
    };
  }

  async disburse(input: DisburseInput): Promise<ProviderResult> {
    return {
      ok: true,
      awaitingApproval: false,
      settled: true,
      providerRef: `SBX-PAYOUT-${input.txnRef}`,
      code: '000',
      message: `Paid ${input.accountName} (${input.accountNumber}) via ${this.channel} (sandbox).`,
    };
  }
}
