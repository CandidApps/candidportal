/**
 * Account enrichment / firmographic fields shared across CRM mapper, persist, and UI.
 */

export type CustomerEnrichmentFields = {
  foundedYear?: string;
  employeeCount?: string;
  mainPhone?: string;
  ceoPrincipal?: string;
  annualRevenue?: string;
  fundingOwnershipType?: string;
  parentCompany?: string;
  publicLocationCount?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  youtubeUrl?: string;
  googleBusinessUrl?: string;
  technologies?: string;
};

export type DbCustomerEnrichmentColumns = {
  founded_year: string | null;
  employee_count: string | null;
  main_phone: string | null;
  ceo_principal: string | null;
  annual_revenue: string | null;
  funding_ownership_type: string | null;
  parent_company: string | null;
  public_location_count: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  google_business_url: string | null;
  technologies: string | null;
};

export const CUSTOMER_ENRICHMENT_FIELD_META: {
  key: keyof CustomerEnrichmentFields;
  db: keyof DbCustomerEnrichmentColumns;
  label: string;
  spreadsheet: string[];
  placeholder?: string;
  multiline?: boolean;
}[] = [
  { key: 'foundedYear', db: 'founded_year', label: 'Founded Year', spreadsheet: ['Founded Year', 'founded_year', 'founded year'], placeholder: 'e.g. 2012' },
  { key: 'employeeCount', db: 'employee_count', label: 'Employee Count', spreadsheet: ['Employee Count Band', 'Employee Count', 'employee_count', 'employee count'], placeholder: 'e.g. 1-10' },
  { key: 'mainPhone', db: 'main_phone', label: 'Main Phone (Company)', spreadsheet: ['Main Phone (Company)', 'Main Phone', 'main_phone', 'company phone'], placeholder: '(555) 555-0100' },
  { key: 'ceoPrincipal', db: 'ceo_principal', label: 'CEO / Founder / Principal', spreadsheet: ['CEO / Founder / Principal', 'ceo_principal', 'CEO'], placeholder: 'Full name' },
  { key: 'annualRevenue', db: 'annual_revenue', label: 'Annual Revenue', spreadsheet: ['Annual Revenue Band', 'Annual Revenue', 'annual_revenue'], placeholder: 'e.g. Under $5M' },
  { key: 'fundingOwnershipType', db: 'funding_ownership_type', label: 'Funding / Ownership Type', spreadsheet: ['Funding / Ownership Type', 'funding_ownership_type'], placeholder: 'e.g. Bootstrapped' },
  { key: 'parentCompany', db: 'parent_company', label: 'Parent Company / Brand', spreadsheet: ['Parent Company / Brand', 'parent_company', 'Parent Company'], placeholder: 'e.g. Independent' },
  { key: 'publicLocationCount', db: 'public_location_count', label: 'Public Location Count', spreadsheet: ['Public Location Count', 'public_location_count'], placeholder: 'e.g. 3' },
  { key: 'facebookUrl', db: 'facebook_url', label: 'Facebook URL', spreadsheet: ['Facebook URL', 'facebook_url'], placeholder: 'https://facebook.com/…' },
  { key: 'instagramUrl', db: 'instagram_url', label: 'Instagram URL', spreadsheet: ['Instagram URL', 'instagram_url'], placeholder: 'https://instagram.com/…' },
  { key: 'twitterUrl', db: 'twitter_url', label: 'X / Twitter URL', spreadsheet: ['X / Twitter URL', 'Twitter URL', 'twitter_url'], placeholder: 'https://x.com/…' },
  { key: 'youtubeUrl', db: 'youtube_url', label: 'YouTube URL', spreadsheet: ['YouTube URL', 'youtube_url'], placeholder: 'https://youtube.com/…' },
  { key: 'googleBusinessUrl', db: 'google_business_url', label: 'Google Business / Maps URL', spreadsheet: ['Google Business / Maps URL', 'google_business_url', 'Google Maps URL'], placeholder: 'https://maps.google.com/…' },
  { key: 'technologies', db: 'technologies', label: 'Technologies (POS / payments / phone)', spreadsheet: ['Technologies (POS / payments / phone)', 'Technologies', 'technologies'], placeholder: 'e.g. Clover; RingCentral', multiline: true },
];

export function enrichmentFieldsFromDb(
  row: Partial<DbCustomerEnrichmentColumns>,
): CustomerEnrichmentFields {
  const out: CustomerEnrichmentFields = {};
  for (const meta of CUSTOMER_ENRICHMENT_FIELD_META) {
    const v = row[meta.db];
    if (v != null && String(v).trim()) out[meta.key] = String(v).trim();
  }
  return out;
}

export function enrichmentFieldsToDb(
  fields: CustomerEnrichmentFields,
): Partial<DbCustomerEnrichmentColumns> {
  const out: Partial<DbCustomerEnrichmentColumns> = {};
  for (const meta of CUSTOMER_ENRICHMENT_FIELD_META) {
    if (fields[meta.key] !== undefined) {
      const raw = fields[meta.key];
      out[meta.db] = raw?.trim() ? raw.trim() : null;
    }
  }
  return out;
}

export function emptyEnrichmentDbColumns(): DbCustomerEnrichmentColumns {
  return {
    founded_year: null,
    employee_count: null,
    main_phone: null,
    ceo_principal: null,
    annual_revenue: null,
    funding_ownership_type: null,
    parent_company: null,
    public_location_count: null,
    facebook_url: null,
    instagram_url: null,
    twitter_url: null,
    youtube_url: null,
    google_business_url: null,
    technologies: null,
  };
}
