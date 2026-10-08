// Pix "BR Code" (EMV Merchant Presented Mode): a mesma string serve para o QR e para o
// "copia e cola". Portado do qrcode-sys (src/lib/qrContent.ts), já testado em apps de banco.

export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";
export const PIX_KEY_TYPES: readonly PixKeyType[] = ["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM"];

export type PixPayload = {
  keyType: PixKeyType;
  key: string;
  name: string;
  city: string;
  description?: string;
  /** sem valor: quem paga digita no app do banco */
  amount?: number;
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Campos de texto do Pix precisam ser ASCII simples (bancos recusam acentos). */
function sanitizePixText(value: string): string {
  return stripAccents(value).replace(/[^A-Za-z0-9 ]/g, "");
}

export function normalizePixKey(keyType: PixKeyType, rawKey: string): string {
  if (keyType === "CPF" || keyType === "CNPJ") return rawKey.replace(/\D/g, "");
  if (keyType === "PHONE") {
    const digits = rawKey.replace(/\D/g, "");
    return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  }
  if (keyType === "RANDOM") return rawKey.trim().toLowerCase();
  return rawKey.trim();
}

// CRC-16/CCITT-FALSE: polinômio 0x1021, início 0xFFFF, sem reflexão ("123456789" -> 29B1).
export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function emvField(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

export function buildPix(p: PixPayload): string {
  const key = normalizePixKey(p.keyType, p.key);
  const name = sanitizePixText(p.name).slice(0, 25).toUpperCase() || "RECEBEDOR";
  const city = sanitizePixText(p.city).slice(0, 15).toUpperCase() || "BRASIL";

  let merchantAccount = emvField("00", "BR.GOV.BCB.PIX") + emvField("01", key);
  if (p.description) {
    const description = sanitizePixText(p.description).slice(0, 25);
    if (description) merchantAccount += emvField("02", description);
  }

  const parts = [
    emvField("00", "01"), // Payload Format Indicator
    emvField("26", merchantAccount), // Merchant Account Info (Pix)
    emvField("52", "0000"), // Merchant Category Code
    emvField("53", "986"), // moeda: BRL
    p.amount ? emvField("54", p.amount.toFixed(2)) : "",
    emvField("58", "BR"),
    emvField("59", name),
    emvField("60", city),
    emvField("62", emvField("05", "***")), // sem txid
  ].join("");

  const withCrcTag = `${parts}6304`;
  return withCrcTag + crc16CcittFalse(withCrcTag);
}
