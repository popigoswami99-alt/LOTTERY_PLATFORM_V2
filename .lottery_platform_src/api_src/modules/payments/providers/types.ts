import type { PaymentChannel } from '@prisma/client';

/**
 * A payment provider abstraction over JazzCash / Easypaisa. Both offer a
 * "mobile account" debit where the customer approves on their own phone with an
 * MPIN, and a disbursement API for paying money out. The rest of the system
 * talks only to this interface, so swapping sandbox for live is a config flip.
 */

export interface InitiateDepositInput {
  txnRef: string;
  amountMinor: bigint;
  /** Customer's mobile-wallet number, e.g. 03001234567. */
  accountNumber: string;
  /** Last 6 digits of CNIC — required by JazzCash MWALLET. */
  cnicLast6?: string;
  description: string;
}

export interface DisburseInput {
  txnRef: string;
  amountMinor: bigint;
  accountNumber: string;
  accountName: string;
}

export interface ProviderResult {
  /** The request was accepted by the provider (not necessarily settled yet). */
  ok: boolean;
  /** The customer must now approve the debit on their wallet with their MPIN. */
  awaitingApproval: boolean;
  /** The movement is already final (rare for MWALLET; common for disbursement). */
  settled: boolean;
  providerRef?: string;
  code?: string;
  message: string;
}

export interface PaymentProvider {
  readonly channel: PaymentChannel;
  /** Ask the provider to debit the customer's wallet. */
  initiateDeposit(input: InitiateDepositInput): Promise<ProviderResult>;
  /** Pay money out to a customer's wallet. */
  disburse(input: DisburseInput): Promise<ProviderResult>;
}
