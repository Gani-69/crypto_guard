import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("file:./dev.db"),
  JWT_SECRET: z.string().default("change-me-dev-only"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  MARKET_DATA_PROVIDER: z.string().default("coingecko"),
  MARKET_DATA_API_KEY: z.string().default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // F2: SMTP config for OTP email delivery.
  // All fields are optional — absence means OTP codes are logged to console (dev stub).
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  // Twilio SMS config for OTP mobile delivery
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_PHONE_NUMBER: z.string().default(""),
  // Resend API key for real email delivery
  RESEND_API_KEY: z.string().default(""),
  // Optional override email for Resend free-tier sandbox testing
  OTP_TEST_OVERRIDE_EMAIL: z.string().default(""),
  // F5: WebAuthn Relying Party config.
  // Must match the origin the browser uses. In dev, defaults to localhost.
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_RP_NAME: z.string().default("CryptoGuard"),
  WEBAUTHN_ORIGIN: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[cryptoguard] Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
