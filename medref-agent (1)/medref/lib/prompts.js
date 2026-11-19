// Prompts, JSON output contracts and trusted source lists for the research agent.

// Domains the web search tool is allowed to read. Subdomains are included automatically.
// Edit these lists to match the regulators / guidelines relevant to your country.
export const MEDICINE_DOMAINS = [
  'dailymed.nlm.nih.gov',            // US FDA labels (SPL)
  'fda.gov',                          // FDA, accessdata.fda.gov, safety communications
  'ema.europa.eu',                    // EU SmPC / EPAR
  'medicines.org.uk',                 // UK eMC SmPC
  'bnf.nice.org.uk',                  // British National Formulary
  'bnfc.nice.org.uk',                 // BNF for Children
  'base-donnees-publique.medicaments.gouv.fr', // French public drug database (RCP)
  'ansm.sante.fr',                    // French regulator
  'vidal.fr',                         // VIDAL (public pages)
  'has-sante.fr',
  'who.int',                          // WHO Model Formulary / EML
  'medlineplus.gov',
  'ncbi.nlm.nih.gov',                 // PubMed, LactMed, StatPearls, LiverTox
  'nih.gov',
  'cdc.gov',
  'tga.gov.au',                       // Australia
  'canada.ca',                        // Health Canada DPD
  'msdmanuals.com',                   // MSD / Merck Manual professional
  'drugs.com',                        // interaction checker & monographs
  'medscape.com',
];

export const PATHOLOGY_DOMAINS = [
  'nice.org.uk',
  'who.int',
  'cdc.gov',
  'has-sante.fr',
  'escardio.org',          // European Society of Cardiology
  'ahajournals.org',       // AHA/ACC guidelines
  'acc.org',
  'idsociety.org',         // IDSA
  'diabetesjournals.org',  // ADA Standards of Care
  'kdigo.org',
  'ginasthma.org',
  'goldcopd.org',
  'esmo.org',
  'eular.org',
  'sign.ac.uk',
  'aafp.org',
  'msdmanuals.com',
  'ncbi.nlm.nih.gov',      // PubMed / StatPearls / Bookshelf
  'nejm.org',
  'thelancet.com',
  'jamanetwork.com',
  'bmj.com',
  'medscape.com',
];

const LANG_NAMES = { en: 'English', fr: 'French', km: 'Khmer', vi: 'Vietnamese', es: 'Spanish' };
export const langName = (code) => LANG_NAMES[code] || 'English';

const COMMON_RULES = `
RESEARCH RULES
- You are a clinical pharmacology research agent writing for HEALTHCARE PROFESSIONALS.
- Use the web_search tool. Prefer primary/official sources in this order: regulatory labels
  (FDA/DailyMed, EMA SmPC, eMC, national databases), national formularies (BNF, WHO), recent
  society guidelines, then high-quality reviews. Do at least 4 searches; look for the MOST RECENT
  label revision and any recent safety communications (boxed warnings, withdrawals, new
  contraindications).
- Never invent doses, numbers or references. If something could not be verified, leave the field
  empty or say "Not found in consulted sources" and mention it in "gaps".
- When sources disagree (e.g. US vs EU label), say so explicitly in the relevant field.
- Every important item should carry "refs": an array of 1-based indices into "sources".
- "sources" must contain only URLs you actually opened in search results, with the
  publication/revision date when visible.

OUTPUT FORMAT
- After researching, reply with ONE JSON object inside a single \`\`\`json code fence and nothing
  after it. No commentary outside the fence. Keep strings concise and clinical
  (monograph style, like VIDAL / BNF).
- Items written as {"text": "...", "refs": [1,2]}.`;

export function medicinePrompt(query, lang, labelExcerpt) {
  return `${COMMON_RULES}

TASK: Build an up-to-date drug monograph for: "${query}".
Write all text values in ${langName(lang)} (keep drug names, units and abbreviations standard).
If the query is a brand name, identify the active ingredient(s) (INN/DCI). If the query is not a
medicine, return {"type":"not_found","message":"..."}.

${labelExcerpt ? `An official label excerpt fetched from openFDA is provided below as a starting point.
Verify it is current and complement it with EU/UK/WHO sources.
<official_label>
${labelExcerpt}
</official_label>
` : ''}
JSON SHAPE:
{
  "type": "medicine",
  "name": "Display name",
  "inn": "International non-proprietary name(s)",
  "brand_names": ["..."],
  "drug_class": "Pharmacotherapeutic class",
  "atc": "ATC code",
  "rx_status": "Prescription-only / OTC / controlled (schedule) ...",
  "forms": ["Tablet 500 mg", "..."],
  "boxed_warning": {"text": "", "refs": []},
  "summary": "2-3 sentence overview",
  "indications": [{"text": "", "refs": []}],
  "dosing": {
    "adult": [{"indication": "", "dose": "", "duration": "", "notes": "", "refs": []}],
    "pediatric": [{"indication": "", "dose": "", "duration": "", "notes": "", "refs": []}],
    "renal": {"text": "", "refs": []},
    "hepatic": {"text": "", "refs": []},
    "elderly": {"text": "", "refs": []},
    "max_dose": {"text": "", "refs": []},
    "administration": {"text": "", "refs": []}
  },
  "contraindications": [{"text": "", "refs": []}],
  "warnings": [{"text": "", "refs": []}],
  "adverse_effects": [{"frequency": "Very common (≥1/10) | Common | Uncommon | Rare | Very rare | Frequency not known", "effects": ["..."], "refs": []}],
  "serious_complications": [{"text": "", "refs": []}],
  "interactions": [{"drug": "", "severity": "contraindicated | major | moderate | minor", "effect": "", "management": "", "refs": []}],
  "pregnancy": {"text": "", "refs": []},
  "lactation": {"text": "", "refs": []},
  "overdose": {"text": "", "refs": []},
  "monitoring": [{"text": "", "refs": []}],
  "pharmacology": {"mechanism": "", "absorption": "", "half_life": "", "metabolism": "", "excretion": ""},
  "regional_differences": {"text": "", "refs": []},
  "recent_safety_updates": [{"date": "", "text": "", "refs": []}],
  "label_revision_date": "Most recent label revision found",
  "gaps": "What could not be verified",
  "sources": [{"title": "", "publisher": "", "url": "", "date": ""}]
}`;
}

export function pathologyPrompt(query, lang) {
  return `${COMMON_RULES}

TASK: Research current clinical practice guidelines for: "${query}" and build a decision
algorithm (diagnosis -> risk stratification -> management) as used by clinicians.
Write all text values in ${langName(lang)}.
Base the algorithm on the most recent major guideline(s) (name them, with year). Mention where
major guidelines differ (e.g. ESC vs AHA, NICE vs IDSA). If the query is not a disease or
clinical problem, return {"type":"not_found","message":"..."}.

ALGORITHM RULES
- 8 to 25 nodes. Node kinds: "start", "decision" (question with 2+ labelled branches),
  "action" (assessment / test / treatment, one "next"), "end" (outcome / disposition).
- Every branch target must be an existing node id. No orphan nodes. Must reach at least one "end".
- Put drug names AND doses in action nodes where the guideline gives them.

JSON SHAPE:
{
  "type": "pathology",
  "name": "Condition name",
  "icd10": "ICD-10 code(s)",
  "specialty": "",
  "summary": "2-3 sentence overview",
  "definition": {"text": "", "refs": []},
  "key_features": [{"text": "", "refs": []}],
  "red_flags": [{"text": "", "refs": []}],
  "diagnosis": {
    "criteria": [{"text": "", "refs": []}],
    "workup": [{"text": "", "refs": []}],
    "differentials": ["..."]
  },
  "severity_scores": [{"name": "e.g. CURB-65", "items": ["..."], "interpretation": ["..."], "refs": []}],
  "algorithm": {
    "title": "",
    "start": "n1",
    "nodes": [
      {"id": "n1", "kind": "start", "text": "Short label", "detail": "Optional detail", "refs": [],
       "next": [{"label": "", "to": "n2"}]}
    ]
  },
  "treatment": [{"line": "First-line | Second-line | Alternative | Supportive", "setting": "e.g. outpatient, ICU, penicillin allergy", "regimen": "", "notes": "", "refs": []}],
  "complications": [{"text": "", "refs": []}],
  "follow_up": [{"text": "", "refs": []}],
  "guidelines": [{"name": "", "organization": "", "year": "", "url": ""}],
  "guideline_differences": {"text": "", "refs": []},
  "gaps": "What could not be verified",
  "sources": [{"title": "", "publisher": "", "url": "", "date": ""}]
}`;
}
