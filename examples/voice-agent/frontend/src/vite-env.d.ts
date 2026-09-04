/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL: string;
  readonly VITE_API_URL: string;
  readonly VITE_BRAND_ORG_NAME?: string;
  readonly VITE_BRAND_SHORT_NAME?: string;
  readonly VITE_BRAND_PRODUCT_NAME?: string;
  readonly VITE_BRAND_ASSISTANT_NAME?: string;
  readonly VITE_BRAND_COORDINATOR_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
