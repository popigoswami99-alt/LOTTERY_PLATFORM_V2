import { PaymentChannel } from '@prisma/client';
import { env } from '../../../config/env.js';
import type { PaymentProvider } from './types.js';
import { SandboxProvider } from './sandbox.provider.js';
import { JazzCashProvider } from './jazzcash.provider.js';
import { EasypaisaProvider } from './easypaisa.provider.js';

export * from './types.js';

const sandbox: Record<PaymentChannel, PaymentProvider> = {
  [PaymentChannel.JAZZCASH]: new SandboxProvider(PaymentChannel.JAZZCASH),
  [PaymentChannel.EASYPAISA]: new SandboxProvider(PaymentChannel.EASYPAISA),
};

const live: Record<PaymentChannel, PaymentProvider> = {
  [PaymentChannel.JAZZCASH]: new JazzCashProvider(),
  [PaymentChannel.EASYPAISA]: new EasypaisaProvider(),
};

/** Resolve the provider for a channel, honouring PAYMENTS_MODE. */
export function getProvider(channel: PaymentChannel): PaymentProvider {
  return env.PAYMENTS_MODE === 'live' ? live[channel] : sandbox[channel];
}

export const isSandbox = () => env.PAYMENTS_MODE !== 'live';
