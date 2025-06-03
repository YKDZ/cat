/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly DATABASE_URL: string | undefined;
  readonly REDIS_URL: string | undefined;
  readonly PORT: string | undefined;
  // Storage
  readonly STORAGE_TYPE: string | undefined;
  // Local
  readonly LOCAL_STORAGE_ROOT_DIR: string | undefined;
  // S3
  readonly S3_ACCESS_KEY_ID: string | undefined;
  readonly S3_SECRET_ACCESS_KEY: string | undefined;
  readonly S3_REGION: string | undefined;
  readonly S3_ACCELERATE_URL: string | undefined;
  readonly S3_UPLOAD_BUCKET_URL: string | undefined;
  readonly S3_UPLOAD_BUCKET_NAME: string | undefined;
  readonly S3_FORCE_PATH_STYLE: string | undefined;
  readonly S3_ACL: string | undefined;
  // OIDC
  readonly OIDC_CLIENT_ID: string | undefined;
  readonly OIDC_CLIENT_SECRET: string | undefined;
  readonly OIDC_ISSUER: string | undefined;
  readonly OIDC_AUTH_URI: string | undefined;
  readonly OIDC_TOKEN_URI: string | undefined;
  readonly OIDC_USERINFO_URI: string | undefined;
  readonly OIDC_LOGOUT_URI: string | undefined;
  readonly OIDC_JWKS_URI: string | undefined;
  readonly OIDC_END_SESSION_URI: string | undefined;
  readonly OIDC_DISPLAY_NAME: string | undefined;
  readonly OIDC_SCOPES: string | undefined;
  // LibreTranslate
  readonly LIBRETRANSLATE_API_URI: string | undefined;
  readonly LIBRETRANSLATE_API_KEY: string | undefined;
  readonly LIBRETRANSLATE_ALTERNATIVES_AMOUNT: string | undefined;
  readonly LIBRETRANSLATE_NAME: string | undefined;
  // Google Cloud Translation
  readonly GOOGLE_CLOUD_PROJECT_ID: string | undefined;
  readonly GOOGLE_CLOUD_API_KEY: string | undefined;
  readonly GOOGLE_CLOUD_NAME: string | undefined;
  // Alibaba Cloud Translation
  readonly ALIBABA_CLOUD_API_ENDPOINT: string | undefined;
  readonly ALIBABA_CLOUD_API_VERSION: string | undefined;
  readonly ALIBABA_CLOUD_ACCESS_KEY_ID: string | undefined;
  readonly ALIBABA_CLOUD_ACCESS_KEY_SECRET: string | undefined;
  readonly ALIBABA_CLOUD_NAME: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
