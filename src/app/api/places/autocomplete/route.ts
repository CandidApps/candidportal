import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function mapsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

/** Proxy Google Places Autocomplete (New) so the key can stay server-side. */
export async function GET(request: Request) {
  const key = mapsApiKey();
  if (!key) {
    return NextResponse.json(
      { suggestions: [], error: 'Google Maps API key is not configured.' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const input = url.searchParams.get('input')?.trim() ?? '';
  if (input.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['us'],
      }),
    });
    const json = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return NextResponse.json(
        { suggestions: [], error: json.error?.message ?? 'Places autocomplete failed' },
        { status: 502 },
      );
    }
    const suggestions = (json.suggestions ?? [])
      .map((s) => {
        const p = s.placePrediction;
        if (!p?.placeId) return null;
        const label =
          p.text?.text ||
          [p.structuredFormat?.mainText?.text, p.structuredFormat?.secondaryText?.text]
            .filter(Boolean)
            .join(', ');
        return {
          placeId: p.placeId,
          label: label || p.placeId,
          mainText: p.structuredFormat?.mainText?.text ?? label,
          secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
        };
      })
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json(
      { suggestions: [], error: err instanceof Error ? err.message : 'Places autocomplete failed' },
      { status: 500 },
    );
  }
}
