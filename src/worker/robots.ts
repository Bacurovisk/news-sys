// robots.txt (RFC 9309) com cache por origem.
// 4xx = sem restrições; 5xx/erro de rede = tudo bloqueado (comportamento conservador da RFC).
import { config } from "./config.ts";
import { decodeBody, safeFetch } from "./safe-fetch.ts";

type Rule = { allow: boolean; pattern: string };
type Entry = { rules: Rule[]; disallowAll: boolean; expires: number };

const BOT_TOKEN = "neojrnewsbot";
const cache = new Map<string, Entry>();

export function parseRobots(text: string): Rule[] {
  type Group = { agents: string[]; rules: Rule[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a.split("/")[0] === BOT_TOKEN));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + re + (anchored ? "$" : "")).test(path);
}

export function isPathAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!matches(r.pattern, path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) {
      best = r;
    }
  }
  return best ? best.allow : true;
}

export async function robotsAllows(rawUrl: string, isAllowedHost: (h: string) => boolean): Promise<boolean> {
  const url = new URL(rawUrl);
  const origin = url.origin;
  let entry = cache.get(origin);

  if (!entry || entry.expires < Date.now()) {
    entry = { rules: [], disallowAll: false, expires: Date.now() + config.robots.ttlMs };
    try {
      const res = await safeFetch(`${origin}/robots.txt`, {
        isAllowedHost,
        headers: { "user-agent": config.userAgent, accept: "text/plain,*/*;q=0.5" },
        timeoutMs: config.robots.timeoutMs,
        maxBytes: config.robots.maxBytes,
        onLimit: "truncate",
      });
      if (res.status >= 200 && res.status < 300) {
        entry.rules = parseRobots(decodeBody(res.body, String(res.headers["content-type"] ?? "")));
      } else if (res.status >= 500) {
        entry.disallowAll = true;
      }
    } catch {
      entry.disallowAll = true;
      entry.expires = Date.now() + 60 * 60 * 1000; // tenta de novo em 1 h
    }
    cache.set(origin, entry);
  }

  if (entry.disallowAll) return false;
  return isPathAllowed(entry.rules, url.pathname + url.search);
}
