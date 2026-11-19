// Demo payloads, shown when no ANTHROPIC_API_KEY is configured, so you can see the UI work.
// ILLUSTRATIVE ONLY — not live research and not for clinical use.

const amoxicillin = {
  type: 'medicine',
  name: 'Amoxicillin',
  inn: 'amoxicillin (amoxicillin trihydrate)',
  brand_names: ['Amoxil', 'Clamoxyl', 'Moxatag'],
  drug_class: 'Antibacterial for systemic use — aminopenicillin (beta-lactam)',
  atc: 'J01CA04',
  rx_status: 'Prescription-only',
  forms: ['Capsule 250 mg, 500 mg', 'Tablet 500 mg, 875 mg', 'Chewable tablet', 'Oral suspension 125/250/400 mg per 5 mL'],
  boxed_warning: { text: '', refs: [] },
  summary: 'Broad-spectrum, bactericidal aminopenicillin used for common respiratory, ENT, urinary and skin infections and as part of H. pylori eradication. Not stable against beta-lactamases.',
  indications: [
    { text: 'Infections of the ear, nose and throat, lower respiratory tract, genitourinary tract and skin caused by susceptible organisms', refs: [1] },
    { text: 'Helicobacter pylori eradication, in combination (triple or dual therapy)', refs: [1, 2] },
  ],
  dosing: {
    adult: [
      { indication: 'ENT, skin, genitourinary — mild/moderate', dose: '500 mg every 12 h or 250 mg every 8 h', duration: '', notes: '', refs: [1] },
      { indication: 'ENT, skin, genitourinary — severe; lower respiratory tract', dose: '875 mg every 12 h or 500 mg every 8 h', duration: '', notes: '', refs: [1] },
      { indication: 'H. pylori (triple therapy)', dose: '1 g twice daily with clarithromycin 500 mg + lansoprazole 30 mg twice daily', duration: '14 days', notes: '', refs: [1] },
    ],
    pediatric: [
      { indication: '≥3 months and <40 kg — mild/moderate', dose: '25 mg/kg/day divided every 12 h or 20 mg/kg/day divided every 8 h', duration: '', notes: 'Children ≥40 kg: adult dosing', refs: [1] },
      { indication: '≥3 months and <40 kg — severe / lower respiratory tract', dose: '45 mg/kg/day divided every 12 h or 40 mg/kg/day divided every 8 h', duration: '', notes: '', refs: [1] },
    ],
    renal: { text: 'GFR 10–30 mL/min: 250–500 mg every 12 h. GFR <10 mL/min: 250–500 mg every 24 h. Haemodialysis: 250–500 mg every 24 h with an extra dose during and after dialysis. Do not use the 875 mg tablet if GFR <30 mL/min.', refs: [1] },
    hepatic: { text: 'Use with caution; monitor hepatic function periodically.', refs: [1] },
    elderly: { text: 'Adjust to renal function.', refs: [1] },
    max_dose: { text: '', refs: [] },
    administration: { text: 'Can be taken with or without food. Shake suspension well.', refs: [1] },
  },
  contraindications: [
    { text: 'History of serious hypersensitivity (e.g. anaphylaxis, Stevens-Johnson syndrome) to amoxicillin or other beta-lactams (penicillins, cephalosporins)', refs: [1, 2] },
  ],
  warnings: [
    { text: 'Serious and occasionally fatal anaphylactic reactions — ask about previous beta-lactam allergy', refs: [1] },
    { text: 'Clostridioides difficile–associated diarrhoea may occur up to 2 months after treatment', refs: [1] },
    { text: 'High incidence of erythematous rash in infectious mononucleosis — avoid', refs: [1, 2] },
  ],
  adverse_effects: [
    { frequency: 'Common', effects: ['Diarrhoea', 'Nausea', 'Skin rash'], refs: [1, 2] },
    { frequency: 'Uncommon', effects: ['Vomiting', 'Urticaria', 'Pruritus'], refs: [2] },
    { frequency: 'Rare / very rare', effects: ['Anaphylaxis', 'Antibiotic-associated colitis', 'Stevens-Johnson syndrome, TEN, DRESS, AGEP', 'Crystalluria', 'Interstitial nephritis'], refs: [2] },
  ],
  serious_complications: [{ text: 'Anaphylaxis; severe cutaneous adverse reactions; C. difficile colitis', refs: [1] }],
  interactions: [
    { drug: 'Methotrexate', severity: 'major', effect: 'Reduced renal clearance of methotrexate → toxicity', management: 'Avoid or monitor methotrexate levels and blood counts', refs: [2] },
    { drug: 'Oral anticoagulants (warfarin)', severity: 'moderate', effect: 'INR may increase', management: 'Monitor INR; adjust anticoagulant dose', refs: [1] },
    { drug: 'Probenecid', severity: 'moderate', effect: 'Increased and prolonged amoxicillin levels', management: 'Usually not clinically harmful', refs: [1] },
    { drug: 'Allopurinol', severity: 'minor', effect: 'Higher risk of skin rash', management: 'Monitor', refs: [1] },
  ],
  pregnancy: { text: 'Widely used; no evidence of harm in human data. Use if clearly needed.', refs: [1, 2] },
  lactation: { text: 'Small amounts in breast milk; compatible with breastfeeding. Monitor infant for diarrhoea or rash.', refs: [3] },
  overdose: { text: 'Mainly gastrointestinal symptoms; crystalluria and renal failure reported. Supportive care, hydration; removable by haemodialysis.', refs: [1] },
  monitoring: [{ text: 'Renal, hepatic and haematological function during prolonged therapy', refs: [1] }],
  pharmacology: {
    mechanism: 'Inhibits bacterial cell-wall synthesis by binding penicillin-binding proteins',
    absorption: 'Well absorbed orally; not significantly affected by food',
    half_life: 'About 1–1.3 h (prolonged in renal impairment)',
    metabolism: 'Limited',
    excretion: 'Mainly renal, ~60% unchanged in urine',
  },
  regional_differences: { text: 'UK/EU dosing often uses 500 mg–1 g three times daily; US label favours twice-daily regimens for many indications.', refs: [1, 2] },
  recent_safety_updates: [],
  label_revision_date: '',
  gaps: 'DEMO DATA — not produced by live research.',
  sources: [
    { title: 'Amoxicillin — FDA prescribing information', publisher: 'DailyMed (NLM)', url: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=amoxicillin', date: '' },
    { title: 'Amoxicillin — BNF', publisher: 'NICE / BNF', url: 'https://bnf.nice.org.uk/drugs/amoxicillin/', date: '' },
    { title: 'LactMed — Drugs and Lactation Database', publisher: 'NCBI Bookshelf', url: 'https://www.ncbi.nlm.nih.gov/books/NBK501922/', date: '' },
  ],
};

const cap = {
  type: 'pathology',
  name: 'Community-acquired pneumonia (adults)',
  icd10: 'J18.9',
  specialty: 'Infectious diseases / Respiratory',
  summary: 'Acute infection of the lung parenchyma acquired outside hospital. Management depends on severity (CURB-65 / PSI, ATS/IDSA criteria), comorbidities and local resistance.',
  definition: { text: 'Acute lower respiratory tract infection with a new infiltrate on chest imaging, acquired in the community.', refs: [1] },
  key_features: [
    { text: 'Cough, fever, dyspnoea, pleuritic chest pain, focal crackles', refs: [1] },
    { text: 'New infiltrate on chest X-ray confirms the diagnosis', refs: [1, 2] },
  ],
  red_flags: [
    { text: 'Respiratory rate ≥30/min, SpO₂ <92%, confusion, systolic BP <90 mmHg', refs: [2] },
    { text: 'Septic shock or need for mechanical ventilation → ICU', refs: [1] },
  ],
  diagnosis: {
    criteria: [{ text: 'Compatible symptoms + new radiographic infiltrate', refs: [1] }],
    workup: [
      { text: 'Chest X-ray, SpO₂, FBC, urea/electrolytes, CRP', refs: [2] },
      { text: 'Severe CAP: blood and sputum cultures, urinary pneumococcal and Legionella antigens', refs: [1] },
    ],
    differentials: ['Acute bronchitis', 'Heart failure', 'Pulmonary embolism', 'Lung cancer', 'Aspiration pneumonitis'],
  },
  severity_scores: [{
    name: 'CURB-65',
    items: ['Confusion', 'Urea >7 mmol/L', 'Respiratory rate ≥30/min', 'BP systolic <90 or diastolic ≤60 mmHg', 'Age ≥65'],
    interpretation: ['0–1: low severity, home treatment usually appropriate', '2: moderate, consider hospital', '3–5: high severity, hospitalise, consider ICU'],
    refs: [2],
  }],
  algorithm: {
    title: 'Adult CAP — diagnosis to treatment',
    start: 'n1',
    nodes: [
      { id: 'n1', kind: 'start', text: 'Suspected CAP', detail: 'Cough, fever, dyspnoea, pleuritic pain, focal signs', refs: [1], next: [{ label: '', to: 'n2' }] },
      { id: 'n2', kind: 'action', text: 'Chest X-ray + vital signs, SpO₂', detail: '', refs: [1, 2], next: [{ label: '', to: 'n3' }] },
      { id: 'n3', kind: 'decision', text: 'New infiltrate on imaging?', detail: '', refs: [1], next: [{ label: 'No', to: 'n4' }, { label: 'Yes', to: 'n5' }] },
      { id: 'n4', kind: 'end', text: 'Consider alternative diagnosis', detail: 'Bronchitis, heart failure, PE…', refs: [], next: [] },
      { id: 'n5', kind: 'action', text: 'Assess severity', detail: 'CURB-65 or PSI, plus ATS/IDSA major/minor criteria', refs: [1, 2], next: [{ label: '', to: 'n6' }] },
      { id: 'n6', kind: 'decision', text: 'Severe CAP?', detail: '1 major criterion (septic shock on vasopressors, or respiratory failure needing ventilation) or ≥3 minor criteria', refs: [1], next: [{ label: 'Yes', to: 'n7' }, { label: 'No', to: 'n9' }] },
      { id: 'n7', kind: 'action', text: 'ICU admission + cultures', detail: 'Blood & sputum cultures, urinary antigens; MRSA/Pseudomonas risk assessment', refs: [1], next: [{ label: '', to: 'n8' }] },
      { id: 'n8', kind: 'action', text: 'β-lactam + macrolide (or + respiratory fluoroquinolone)', detail: 'e.g. ceftriaxone 1–2 g daily + azithromycin 500 mg daily', refs: [1], next: [{ label: '', to: 'n14' }] },
      { id: 'n9', kind: 'decision', text: 'CURB-65 score?', detail: '', refs: [2], next: [{ label: '0–1', to: 'n10' }, { label: '≥2', to: 'n13' }] },
      { id: 'n10', kind: 'decision', text: 'Comorbidities or recent antibiotics?', detail: 'Chronic heart, lung, liver, renal disease, diabetes, alcoholism, malignancy, asplenia', refs: [1], next: [{ label: 'No', to: 'n11' }, { label: 'Yes', to: 'n12' }] },
      { id: 'n11', kind: 'action', text: 'Outpatient: amoxicillin', detail: 'ATS/IDSA: amoxicillin 1 g three times daily (alternatives: doxycycline 100 mg twice daily). NICE: amoxicillin 500 mg three times daily for 5 days.', refs: [1, 2], next: [{ label: '', to: 'n14' }] },
      { id: 'n12', kind: 'action', text: 'Outpatient: amoxicillin-clavulanate or cephalosporin + macrolide/doxycycline, or respiratory FQ', detail: 'e.g. amoxicillin-clavulanate 875/125 mg twice daily + azithromycin', refs: [1], next: [{ label: '', to: 'n14' }] },
      { id: 'n13', kind: 'action', text: 'Hospital ward: β-lactam + macrolide or respiratory FQ', detail: 'e.g. ceftriaxone 1–2 g daily + azithromycin 500 mg daily', refs: [1], next: [{ label: '', to: 'n14' }] },
      { id: 'n14', kind: 'decision', text: 'Clinically stable at 48–72 h?', detail: '', refs: [1], next: [{ label: 'Yes', to: 'n15' }, { label: 'No', to: 'n16' }] },
      { id: 'n15', kind: 'end', text: 'Oral step-down; total ≥5 days', detail: 'Stop when clinically stable for ≥48 h', refs: [1, 2], next: [] },
      { id: 'n16', kind: 'end', text: 'Re-evaluate', detail: 'Complications (empyema, abscess), resistant or unusual pathogens, alternative diagnosis', refs: [1], next: [] },
    ],
  },
  treatment: [
    { line: 'First-line', setting: 'Outpatient, no comorbidities', regimen: 'Amoxicillin 1 g three times daily (ATS/IDSA) or 500 mg three times daily (NICE)', notes: 'Doxycycline as alternative', refs: [1, 2] },
    { line: 'First-line', setting: 'Outpatient with comorbidities', regimen: 'Amoxicillin-clavulanate or cephalosporin + macrolide or doxycycline; or respiratory fluoroquinolone', notes: '', refs: [1] },
    { line: 'First-line', setting: 'Inpatient, non-severe', regimen: 'β-lactam + macrolide, or respiratory fluoroquinolone', notes: '', refs: [1] },
  ],
  complications: [{ text: 'Parapneumonic effusion/empyema, lung abscess, sepsis, ARDS', refs: [1] }],
  follow_up: [{ text: 'Clinical review at 48 h if outpatient; repeat chest X-ray at 6 weeks if symptoms persist or high risk of malignancy', refs: [2] }],
  guidelines: [
    { name: 'Diagnosis and Treatment of Adults with Community-acquired Pneumonia', organization: 'ATS / IDSA', year: '2019', url: 'https://www.idsociety.org/practice-guideline/community-acquired-pneumonia-cap-in-adults/' },
    { name: 'Pneumonia (community-acquired): antimicrobial prescribing (NG138)', organization: 'NICE', year: '2019', url: 'https://www.nice.org.uk/guidance/ng138' },
  ],
  guideline_differences: { text: 'ATS/IDSA uses higher-dose amoxicillin (1 g TID) and PSI preferred over CURB-65; NICE uses CURB-65 and 500 mg TID for low severity.', refs: [1, 2] },
  gaps: 'DEMO DATA — not produced by live research.',
  sources: [
    { title: 'CAP in Adults — ATS/IDSA guideline', publisher: 'IDSA', url: 'https://www.idsociety.org/practice-guideline/community-acquired-pneumonia-cap-in-adults/', date: '2019' },
    { title: 'NG138 Pneumonia (community-acquired): antimicrobial prescribing', publisher: 'NICE', url: 'https://www.nice.org.uk/guidance/ng138', date: '2019' },
  ],
};

export function demoResult(mode, query, lang) {
  const data = mode === 'medicine' ? amoxicillin : cap;
  return {
    data,
    meta: {
      mode, query, lang, demo: true, model: 'demo',
      generated_at: new Date().toISOString(),
      searches: mode === 'medicine'
        ? ['amoxicillin prescribing information dailymed', 'amoxicillin SmPC renal impairment', 'amoxicillin BNF dose', 'amoxicillin lactation LactMed']
        : ['community acquired pneumonia guideline IDSA', 'NICE pneumonia CURB-65 antibiotic', 'CAP severity criteria ICU'],
      consulted: data.sources.map((s) => ({ title: s.title, url: s.url })),
    },
  };
}
