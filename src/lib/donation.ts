import "server-only";
import { PIX_KEY_TYPES, type PixKeyType, type PixPayload } from "./pix";
import { safeHref } from "./safe-url";

export type DonationConfig = {
  pix: Omit<PixPayload, "amount"> | null;
  paypalUrl: string | null;
};

/** Lido em runtime das envs do servidor; sem Pix nem PayPal, o botão de doação some. */
export function getDonationConfig(): DonationConfig {
  const key = process.env.PIX_KEY?.trim();
  const name = process.env.PIX_NAME?.trim();
  const city = process.env.PIX_CITY?.trim();
  const rawType = process.env.PIX_KEY_TYPE?.trim().toUpperCase() ?? "RANDOM";
  const keyType = (PIX_KEY_TYPES as readonly string[]).includes(rawType) ? (rawType as PixKeyType) : "RANDOM";

  return {
    pix:
      key && name && city
        ? { keyType, key, name, city, description: process.env.PIX_DESCRIPTION?.trim() || undefined }
        : null,
    paypalUrl: safeHref(process.env.PAYPAL_DONATE_URL?.trim()),
  };
}

export function donationsEnabled(): boolean {
  const { pix, paypalUrl } = getDonationConfig();
  return Boolean(pix || paypalUrl);
}
