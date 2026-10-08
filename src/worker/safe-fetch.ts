// HTTP GET com proteções contra SSRF:
// - só http/https nas portas 80/443;
// - host precisa passar em isAllowedHost (domínios das fontes cadastradas);
// - todo IP resolvido (inclusive em redirecionamentos) é checado contra faixas
//   privadas/loopback/link-local no momento da conexão (evita DNS rebinding);
// - redirecionamentos seguidos manualmente, cada salto revalidado;
// - timeout total e limite de bytes (após descompressão).
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

export class FetchError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message || code);
    this.name = "FetchError";
  }
}

export type SafeFetchOptions = {
  isAllowedHost: (hostname: string) => boolean;
  headers?: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  /** "error": estourar maxBytes é falha; "truncate": devolve o que leu até ali. */
  onLimit?: "error" | "truncate";
  /** Encerra a leitura cedo quando retornar true (ex.: achou </head>). */
  stopWhen?: (body: Buffer) => boolean;
};

export type SafeResponse = {
  status: number;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

// Listas separadas: no BlockList do Node, uma regra IPv6 ::ffff:0:0/96 casa com qualquer IPv4.
const blockedV4 = new net.BlockList();
const blockedV6 = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(addr, prefix, "ipv6");
}

export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blockedV4.check(ip, "ipv4");
  if (family !== 6) return true;
  // IPv4 mapeado em IPv6 (::ffff:a.b.c.d ou ::ffff:XXXX:XXXX): checa o IPv4 embutido.
  const mapped = /^::ffff:(?:0:)?(.+)$/i.exec(ip)?.[1];
  if (mapped) {
    if (net.isIPv4(mapped)) return blockedV4.check(mapped, "ipv4");
    const hex = /^([\da-f]{1,4}):([\da-f]{1,4})$/i.exec(mapped);
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return blockedV4.check([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."), "ipv4");
    }
    return true;
  }
  return blockedV6.check(ip, "ipv6");
}

// lookup usado pelo socket: resolve e recusa a conexão se algum IP for interno.
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad || list.length === 0) {
      return callback(new FetchError("blocked_ip", `${hostname} resolve para IP bloqueado`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export function checkUrl(raw: string | URL, isAllowedHost: (h: string) => boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("blocked_protocol");
  if (url.port !== "" && url.port !== "80" && url.port !== "443") throw new FetchError("blocked_port");
  if (url.username || url.password) throw new FetchError("blocked_credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) throw new FetchError("blocked_ip", "URL com IP literal");
  if (!isAllowedHost(host.toLowerCase())) throw new FetchError("blocked_host", host);
  return url;
}

function requestOnce(url: URL, opts: SafeFetchOptions, signal: AbortSignal): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: { "accept-encoding": "gzip, deflate, br", ...opts.headers },
        lookup: guardedLookup,
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const base = { status, url: url.toString(), headers: res.headers };
        if ((status >= 300 && status < 400) || status === 304 || status >= 400) {
          res.resume();
          return resolve({ ...base, body: Buffer.alloc(0) });
        }

        let stream: Readable = res;
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          res.destroy();
          resolve({ ...base, body: Buffer.concat(chunks, size) });
        };

        stream.on("data", (chunk: Buffer) => {
          if (done) return;
          if (size + chunk.length > opts.maxBytes) {
            if (opts.onLimit === "truncate") {
              chunks.push(chunk.subarray(0, opts.maxBytes - size));
              size = opts.maxBytes;
              return finish();
            }
            done = true;
            res.destroy();
            return reject(new FetchError("too_large", `resposta maior que ${opts.maxBytes} bytes`));
          }
          chunks.push(chunk);
          size += chunk.length;
          if (opts.stopWhen?.(Buffer.concat(chunks, size))) finish();
        });
        stream.on("end", finish);
        stream.on("error", (err) => {
          if (!done) {
            done = true;
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const maxRedirects = opts.maxRedirects ?? 5;
  let url = checkUrl(rawUrl, opts.isAllowedHost);

  for (let hop = 0; ; hop++) {
    let res: SafeResponse;
    try {
      res = await requestOnce(url, opts, signal);
    } catch (err) {
      if (err instanceof FetchError) throw err;
      if (signal.aborted) throw new FetchError("timeout", `sem resposta em ${opts.timeoutMs} ms`);
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof FetchError) throw cause;
      const code = (err as NodeJS.ErrnoException).code;
      throw new FetchError(code ? `net_${code.toLowerCase()}` : "network", (err as Error).message);
    }

    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const location = res.headers.location;
      if (!location) throw new FetchError(`http_${res.status}`, "redirecionamento sem Location");
      if (hop >= maxRedirects) throw new FetchError("too_many_redirects");
      url = checkUrl(new URL(location, url), opts.isAllowedHost);
      continue;
    }
    return res;
  }
}

/** Decodifica o corpo usando o charset do Content-Type ou da declaração XML/HTML. */
export function decodeBody(body: Buffer, contentType?: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const head = body.subarray(0, 1024).toString("latin1");
  const fromDoc =
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader ?? fromDoc ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
