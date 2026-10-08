import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { SiteHeader } from "@/components/SiteHeader";
import { getLocations } from "@/lib/articles";
import { getDonationConfig } from "@/lib/donation";
import { buildPix } from "@/lib/pix";
import { qrSvg } from "@/lib/qr-svg";

export const metadata: Metadata = {
  title: "Apoie o projeto",
  description: "Apoie o neojr news com uma doação via Pix ou PayPal. O site é gratuito e mantido de forma independente.",
};

const SUGGESTED_AMOUNTS = [5, 10, 25];

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Marca "PayPal" do simple-icons (CC0), inline para não depender de outro domínio.
function PayPalLogo({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" aria-label="PayPal" className={className}>
      <path
        className="fill-[#003087] dark:fill-[#8fb8ff]"
        d="M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z"
      />
    </svg>
  );
}

export default async function DoarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, locations] = await Promise.all([searchParams, getLocations()]);
  const { pix, paypalUrl } = getDonationConfig();

  const raw = Number(Array.isArray(params.valor) ? params.valor[0] : params.valor);
  const amount = SUGGESTED_AMOUNTS.includes(raw) ? raw : undefined;
  const pixCode = pix ? buildPix({ ...pix, amount }) : null;
  const qr = pixCode ? qrSvg(pixCode) : null;

  const options: { label: string; value?: number }[] = [
    { label: "Valor livre" },
    ...SUGGESTED_AMOUNTS.map((v) => ({ label: formatBrl(v), value: v })),
  ];

  return (
    <>
      <SiteHeader filters={{}} locations={locations} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">Apoie o neojr news</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          O neojr news é gratuito, sem anúncios e mantido como projeto pessoal. Se ele te ajuda a acompanhar as
          notícias, uma doação de qualquer valor ajuda a pagar o servidor. Doar não libera nada extra: é só um
          agradecimento. ☕
        </p>

        {!pix && !paypalUrl ? (
          <p className="mt-8 text-sm text-neutral-600 dark:text-neutral-400">As doações ainda não estão disponíveis.</p>
        ) : (
          <div className={`mt-8 grid gap-6 ${pix && paypalUrl ? "sm:grid-cols-2" : "max-w-md"}`}>
            {pix && pixCode && qr && (
              <section aria-labelledby="pix" className="flex flex-col items-center rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
                <h2 id="pix" className="self-start text-lg font-semibold">
                  Pix
                </h2>
                <p className="mt-1 mb-4 self-start text-sm text-neutral-600 dark:text-neutral-400">
                  Escaneie o QR code no app do seu banco ou use o copia e cola. Recebedor: <strong>{pix.name}</strong>.
                </p>

                <nav aria-label="Valor da doação" className="flex flex-wrap justify-center gap-2">
                  {options.map((o) => {
                    const selected = o.value === amount;
                    return (
                      <Link
                        key={o.label}
                        href={o.value ? `/doar?valor=${o.value}` : "/doar"}
                        aria-current={selected ? "page" : undefined}
                        scroll={false}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          selected
                            ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                            : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        }`}
                      >
                        {o.label}
                      </Link>
                    );
                  })}
                </nav>

                {/* Fundo branco também no tema escuro: leitores de QR precisam de contraste. */}
                <svg
                  viewBox={`0 0 ${qr.size} ${qr.size}`}
                  role="img"
                  aria-label={amount ? `QR code Pix de ${formatBrl(amount)}` : "QR code Pix com valor livre"}
                  shapeRendering="crispEdges"
                  className="mt-4 size-56 rounded-lg border border-neutral-200 dark:border-neutral-700"
                >
                  <rect width={qr.size} height={qr.size} fill="#fff" />
                  <path d={qr.path} fill="#111827" />
                </svg>

                <p className="mt-3 text-center text-sm text-neutral-600 dark:text-neutral-400">
                  {amount ? `Doação de ${formatBrl(amount)}.` : "Você escolhe o valor no app do seu banco."}
                </p>

                <div className="mt-4">
                  <CopyButton text={pixCode} label="Copiar código Pix" />
                </div>
                <label htmlFor="pix-code" className="sr-only">
                  Código Pix copia e cola
                </label>
                <textarea
                  id="pix-code"
                  readOnly
                  value={pixCode}
                  rows={3}
                  className="mt-3 w-full resize-none rounded-md border border-neutral-300 bg-neutral-50 p-2 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                />
              </section>
            )}

            {paypalUrl && (
              <section aria-labelledby="paypal" className="flex flex-col rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
                <h2 id="paypal" className="text-lg font-semibold">
                  PayPal
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Doe com cartão de crédito ou saldo PayPal, de qualquer lugar do mundo.
                </p>
                <div className="flex flex-1 items-center justify-center py-8">
                  <PayPalLogo className="size-24 sm:size-32" />
                </div>
                <div className="flex justify-center">
                  <a
                    href={paypalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center rounded-full bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400"
                  >
                    Doar com PayPal
                  </a>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
