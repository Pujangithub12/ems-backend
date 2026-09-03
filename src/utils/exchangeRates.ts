/** Today's foreign-currency -> NPR *selling* rates, sourced from Nepal Rastra Bank's public
 * forex API — used to show a manual Finance record's "Refunded" amount in NPR when the record's
 * currency isn't NPR. Cached in-memory for the calendar day so repeat requests (every page load)
 * don't re-hit the external API; NRB publishes one rate per day anyway. */

/** This app's currency codes -> NRB's ISO3 code. RMB is NRB's "CNY". NPR needs no lookup (rate 1). */
const CURRENCY_TO_ISO3: Record<string, string> = { USD: "USD", INR: "INR", RMB: "CNY" };

type NrbRate = { currency: { iso3: string; unit: number }; sell: string };
type NrbResponse = { data: { payload: { date: string; rates: NrbRate[] }[] } };

let cache: { fetchedOn: string; rates: Record<string, number> } | null = null;

const toYmd = (d: Date) => d.toISOString().slice(0, 10);

/** Returns today's { NPR: 1, USD, INR, RMB } sell rates (NPR per 1 foreign unit). Falls back to
 * the last successfully cached rates (even if stale) rather than throwing, so a transient NRB
 * outage doesn't break the Finance page — callers should treat a missing currency key as
 * "conversion unavailable" and just show the native-currency amount. */
export async function getTodayExchangeRates(): Promise<Record<string, number>> {
  const today = new Date();
  const todayYmd = toYmd(today);
  if (cache && cache.fetchedOn === todayYmd) return cache.rates;

  try {
    // NRB requires an explicit from/to range and only publishes on business days, so look back a
    // week and take whichever is most recent — the rate NRB currently has in effect.
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const url = `https://www.nrb.org.np/api/forex/v1/rates?page=1&per_page=10&from=${toYmd(weekAgo)}&to=${todayYmd}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`NRB forex API returned ${res.status}`);
    const body = (await res.json()) as NrbResponse;
    const payload = body.data?.payload ?? [];
    const latest = [...payload].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!latest) throw new Error("NRB forex API returned no rates");

    const rates: Record<string, number> = { NPR: 1 };
    for (const [ourCode, iso3] of Object.entries(CURRENCY_TO_ISO3)) {
      const entry = latest.rates.find((r) => r.currency.iso3 === iso3);
      if (entry) {
        const unit = entry.currency.unit || 1;
        rates[ourCode] = parseFloat(entry.sell) / unit;
      }
    }

    cache = { fetchedOn: todayYmd, rates };
    return rates;
  } catch (error) {
    console.error("Failed to fetch today's exchange rates from NRB:", error);
    return cache?.rates ?? { NPR: 1 };
  }
}
