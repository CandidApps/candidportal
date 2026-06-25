import type { UcaasCatalog } from '@/lib/ucaas/types';

// Vonage "Instant Quote" catalog — transcribed from the rep's Excel quoting tool.
// Unit prices and fee/tax formulas mirror the spreadsheet exactly.

export const VONAGE_DEFAULT_CATALOG: UcaasCatalog = {
  items: [
    // ----- One-time setup -----
    {
      id: 'location_activation',
      section: 'setup',
      name: 'Location Activation',
      description: 'Per-location activation charge.',
      unitPrice: 400,
      defaultQuantity: 0,
    },
    {
      id: 'activation_discount',
      section: 'setup',
      name: 'Activation Discount',
      unitPrice: -650,
      defaultQuantity: 1,
      flat: true,
    },
    {
      id: 'remote_configuration',
      section: 'setup',
      name: 'Remote Configuration & Setup',
      description:
        'Remote configuration to match requirements, plug-and-play install, transfer, lifetime Vonage call/chat/email support, remote training, Support Assist.',
      unitPrice: 0,
      defaultQuantity: 1,
    },
    {
      id: 'white_glove',
      section: 'setup',
      name: 'Premium White Glove Support (optional)',
      description:
        'Onsite install, onsite 90-minute training, 1 month premium support with unlimited support, tailored call greetings, and more.',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'standard_shipping',
      section: 'setup',
      name: 'Standard Shipping',
      unitPrice: 0,
      defaultQuantity: 1,
    },

    // ----- Recurring monthly -----
    {
      id: 'unlimited_extension',
      section: 'monthly',
      name: 'Unlimited Extension',
      unitPrice: 12.99,
      defaultQuantity: 0,
    },
    { id: 'call_group', section: 'monthly', name: 'Call Group', unitPrice: 0, defaultQuantity: 0 },
    {
      id: 'business_number_inbox',
      section: 'monthly',
      name: 'Business Number Inbox',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'secondary_line_appearance',
      section: 'monthly',
      name: 'Secondary Line Appearance',
      unitPrice: 9.99,
      defaultQuantity: 0,
    },
    {
      id: 'local_company_number',
      section: 'monthly',
      name: 'Local Company Number',
      unitPrice: 4.99,
      defaultQuantity: 0,
    },
    {
      id: 'visual_voicemail',
      section: 'monthly',
      name: 'Visual Voicemail',
      unitPrice: 4.99,
      defaultQuantity: 0,
    },
    {
      id: 'virtual_receptionist',
      section: 'monthly',
      name: 'Virtual Receptionist',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'business_inbox',
      section: 'monthly',
      name: 'Business Inbox',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'sms_messaging',
      section: 'monthly',
      name: 'SMS Messaging',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'on_demand_call_recording',
      section: 'monthly',
      name: 'On Demand Call Recording',
      unitPrice: 4.99,
      defaultQuantity: 0,
    },
    {
      id: 'automated_company_call_recording',
      section: 'monthly',
      name: 'Automated Company Call Recording',
      unitPrice: 49.99,
      defaultQuantity: 0,
    },
    {
      id: 'holiday_scheduler',
      section: 'monthly',
      name: 'Holiday Scheduler',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'paperless_fax',
      section: 'monthly',
      name: 'Paperless Fax',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'hipaa_conferencing',
      section: 'monthly',
      name: 'HIPAA Compliant Conferencing',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'yealink_desk_phones',
      section: 'monthly',
      name: 'Yealink Desk Phones with Power Supply',
      unitPrice: 0,
      defaultQuantity: 0,
    },
    {
      id: 'yealink_comp',
      section: 'monthly',
      name: 'Yealink Comp',
      unitPrice: -200,
      defaultQuantity: 0,
    },
    {
      id: 'crm_integration',
      section: 'monthly',
      name: 'CRM Integration',
      unitPrice: 0,
      defaultQuantity: 0,
    },
  ],
  fees: [
    {
      id: 'recovery_fee',
      name: 'Recovery Fee',
      section: 'monthly',
      perUnit: 3.5,
      driverItemIds: ['unlimited_extension', 'secondary_line_appearance', 'local_company_number'],
    },
    {
      id: 'emergency_services_fee',
      name: 'Emergency Services Fee',
      section: 'monthly',
      perUnit: 0.99,
      driverItemIds: ['unlimited_extension', 'secondary_line_appearance'],
    },
  ],
  tax: {
    monthlyTaxRatePct: 35,
    setupTaxLabels: ['State – Sales Tax', 'County – Transit Tax'],
  },
};

/** Built-in UCaaS catalogs keyed by provider slug, used to auto-seed on first use. */
export const BUILTIN_UCAAS_CATALOGS: Record<string, { name: string; catalog: UcaasCatalog }> = {
  vonage: { name: 'Vonage Instant Quote', catalog: VONAGE_DEFAULT_CATALOG },
};
