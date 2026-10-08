// Domínios que o worker pode acessar: os hosts de feedUrl e siteUrl das fontes cadastradas
// (sem "www."), incluindo subdomínios. Ex.: siteUrl www.folha.uol.com.br libera
// www1.folha.uol.com.br e feeds.folha.uol.com.br.
export function baseHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\d*\./, "");
  } catch {
    return null;
  }
}

export function makeHostAllowList(urls: Iterable<string>): (hostname: string) => boolean {
  const allowed = new Set<string>();
  for (const u of urls) {
    const h = baseHost(u);
    if (h) allowed.add(h);
  }
  return (hostname: string) => {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    for (const d of allowed) {
      if (host === d || host.endsWith("." + d)) return true;
    }
    return false;
  };
}
