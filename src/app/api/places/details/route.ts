import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function mapsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

type AddressParts = {
  street: string;
  city: string;
  state: string;
  zip: string;
  formatted: string;
};

function parseAddressComponents(
  components: Array<{ longText?: string; shortText?: string; types?: string[] }>,
  formatted: string,
): AddressParts {
  const get = (type: string, short = false) => {
    const c = components.find((x) => x.types?.includes(type));
    return (short ? c?.shortText : c?.longText) || c?.longText || c?.shortText || '';
  };
  const streetNumber = get('street_number');
  const route = get('route');
  const street = [streetNumber, route].filter(Boolean).join(' ').trim();
  return {
    street: street || formatted.split(',')[0]?.trim() || '',
    city: get('locality') || get('sublocality') || get('postal_town') || '',
    state: get('administrative_area_level_1', true),
    zip: get('postal_code'),
    formatted,
  };
}

/** Resolve a Place ID into street / city / state / ZIP. */
export async function GET(request: Request) {
  const key = mapsApiKey();
  if (!key) {
    return NextResponse.json({ error: 'Google Maps API key is not configured.' }, { status: 503 });
  }

  const placeId = new URL(request.url).searchParams.get('placeId')?.trim();
  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 });
  }

  const id = placeId.startsWith('places/') ? placeId : `places/${placeId}`;

  try {
    const res = await fetch(`https://places.googleapis.com/v1/${id}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,formattedAddress,addressComponents',
      },
    });
    const json = (await res.json()) as {
      formattedAddress?: string;
      addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? 'Place details failed' },
        { status: 502 },
      );
    }
    const address = parseAddressComponents(
      json.addressComponents ?? [],
      json.formattedAddress ?? '',
    );
    return NextResponse.json({ address });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Place details failed' },
      { status: 500 },
    );
  }
}
