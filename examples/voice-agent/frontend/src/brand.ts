/**
 * White-label brand constants for the frontend.
 *
 * Values come from Vite env vars (VITE_BRAND_*) which are derived from
 * /config/client.config.json via `npm run apply:config`. Generic defaults are
 * used when env vars are absent, so an un-customized fork still renders.
 */
const env = import.meta.env;

export const brand = {
  orgName: env.VITE_BRAND_ORG_NAME ?? 'Acme Health',
  shortName: env.VITE_BRAND_SHORT_NAME ?? 'Acme',
  productName: env.VITE_BRAND_PRODUCT_NAME ?? 'Acme Voice Agent',
  assistantName: env.VITE_BRAND_ASSISTANT_NAME ?? 'Acme Virtual Assistant',
  coordinatorLabel: env.VITE_BRAND_COORDINATOR_LABEL ?? `${env.VITE_BRAND_SHORT_NAME ?? 'Acme'} Coordinator`,
} as const;
