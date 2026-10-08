import QRCode from "qrcode";

export type QrSvg = { size: number; path: string };

/** Matriz do QR como um único path SVG (renderizado no servidor, sem script nem <img>). */
export function qrSvg(text: string, margin = 4): QrSvg {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules.get(y, x)) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  return { size: n + margin * 2, path };
}
