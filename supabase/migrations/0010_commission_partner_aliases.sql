-- Align commission partner display names and bank aliases with BMW pay sources.

update public.partner_suppliers
set
  display_name = 'TekSystems',
  bank_source_aliases = array['TekPartners', 'Tek Partners', 'TekSystems']
where name = 'TekPartners';

update public.partner_suppliers
set
  display_name = 'CorpIT',
  bank_source_aliases = array['CorpIT', 'Corporate IT Dept.', 'Corporate IT Department']
where name = 'CorpIT';
