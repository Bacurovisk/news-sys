import type { Location } from "@/lib/articles";
import { donationsEnabled } from "@/lib/donation";
import type { Filters } from "@/lib/filters";
import { DonateButton } from "./DonateButton";
import { LocationSelect } from "./LocationSelect";
import { Logo } from "./Logo";
import { SearchBar } from "./SearchBar";

export function SiteHeader({ filters, locations }: { filters: Filters; locations: Location[] }) {
  return (
    <header className="border-b border-neutral-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto grid max-w-4xl grid-cols-[auto_1fr] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-6">
        <Logo />
        <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
          <SearchBar filters={filters} />
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <LocationSelect filters={filters} locations={locations} />
          {donationsEnabled() && <DonateButton />}
        </div>
      </div>
    </header>
  );
}
