// Fetches the official US label (SPL) from openFDA to ground the agent with primary-source text.
// Free API, no key required (an optional key raises the rate limit): https://open.fda.gov/apis/drug/label/

const FIELDS = [
  ['boxed_warning', 'BOXED WARNING'],
  ['indications_and_usage', 'INDICATIONS'],
  ['dosage_and_administration', 'DOSAGE AND ADMINISTRATION'],
  ['contraindications', 'CONTRAINDICATIONS'],
  ['warnings_and_cautions', 'WARNINGS AND PRECAUTIONS'],
  ['warnings', 'WARNINGS'],
  ['adverse_reactions', 'ADVERSE REACTIONS'],
  ['drug_interactions', 'DRUG INTERACTIONS'],
  ['pregnancy', 'PREGNANCY'],
  ['use_in_specific_populations', 'SPECIFIC POPULATIONS'],
  ['overdosage', 'OVERDOSAGE'],
];
const PER_FIELD = 1800;

export async function fetchOpenFdaLabel(name, { apiKey, timeoutMs = 8000 } = {}) {
  const term = name.replace(/["\\]/g, '').trim();
  if (!term) return null;
  const search = `(openfda.generic_name:"${term}")+OR+(openfda.brand_name:"${term}")`;
  const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(search).replace(/%2B/g, '+')}` +
    `&sort=effective_time:desc&limit=1${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json.results?.[0];
    if (!r) return null;
    const setId = r.set_id || r.openfda?.spl_set_id?.[0];
    const t = r.effective_time || '';
    const date = t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : t;
    const parts = [
      `Product: ${(r.openfda?.brand_name || []).join(', ')} (${(r.openfda?.generic_name || []).join(', ')})`,
      `Label effective date: ${date}`,
      setId ? `DailyMed: https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${setId}` : '',
    ];
    for (const [key, label] of FIELDS) {
      const txt = Array.isArray(r[key]) ? r[key].join(' ') : '';
      if (txt) parts.push(`## ${label}\n${txt.replace(/\s+/g, ' ').slice(0, PER_FIELD)}${txt.length > PER_FIELD ? ' …' : ''}`);
    }
    return {
      excerpt: parts.filter(Boolean).join('\n'),
      source: {
        title: `${(r.openfda?.brand_name || [term])[0]} — FDA prescribing information`,
        publisher: 'U.S. FDA / DailyMed (via openFDA)',
        url: setId ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${setId}` : 'https://open.fda.gov/',
        date,
      },
    };
  } catch {
    return null; // non-fatal: the agent still researches the web
  }
}
