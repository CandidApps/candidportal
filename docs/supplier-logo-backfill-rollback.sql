-- Restores solution_providers website/logo values changed by the 2026-09-29 logo backfill (CR-0102).
update solution_providers set website = null
where id in (83,139,172,209,233,242,310,418,520,565,578,592,657,461,732,742,781,786,797,825,833,852,201,202,248,353,484,570,761);

update solution_providers set website = 'https://bluebird.com',
  logo_url = 'https://xqzerfzlisvqcgatpeyv.supabase.co/storage/v1/object/public/app/supplier-logos/bluebird-network-llc-1790027265.png',
  logo_storage_path = 'supplier-logos/bluebird-network-llc-1790027265.png' where id = 163;
update solution_providers set website = 'https://crown-castle.com',
  logo_url = 'https://xqzerfzlisvqcgatpeyv.supabase.co/storage/v1/object/public/app/supplier-logos/crown-castle-1790027282.ico',
  logo_storage_path = 'supplier-logos/crown-castle-1790027282.ico' where id = 252;
update solution_providers set website = 'https://skywire.com',
  logo_url = 'https://xqzerfzlisvqcgatpeyv.supabase.co/storage/v1/object/public/app/supplier-logos/skywire-1790027375.ico',
  logo_storage_path = 'supplier-logos/skywire-1790027375.ico' where id = 667;
update solution_providers set website = 'https://splice.com',
  logo_url = 'https://xqzerfzlisvqcgatpeyv.supabase.co/storage/v1/object/public/app/supplier-logos/splice-1790027380.png',
  logo_storage_path = 'supplier-logos/splice-1790027380.png' where id = 691;
update solution_providers set website = 'https://touchtone.com',
  logo_url = 'https://xqzerfzlisvqcgatpeyv.supabase.co/storage/v1/object/public/app/supplier-logos/touchtone-1790027397.png',
  logo_storage_path = 'supplier-logos/touchtone-1790027397.png' where id = 768;
update solution_providers set website = 'https://touchtone.com',
  logo_url = 'https://xqzerfzlisvqcgatpeyv.supabase.co/storage/v1/object/public/app/supplier-logos/touchtone-communications-1790027398.png',
  logo_storage_path = 'supplier-logos/touchtone-communications-1790027398.png' where id = 769;
