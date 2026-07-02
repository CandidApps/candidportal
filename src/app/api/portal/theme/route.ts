import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_THEME_PRESET_ID } from '@/lib/themes/presets';
import {
  buildCustomThemePreset,
  customThemePresetId,
  validateCustomThemeColors,
} from '@/lib/themes/build-custom-preset';
import type { ColorScheme } from '@/lib/themes/types';

export const dynamic = 'force-dynamic';

type CustomThemeRow = {
  id: string;
  name: string;
  colors: string[];
  created_at: string;
  updated_at: string;
};

function mapCustomTheme(row: CustomThemeRow) {
  const colors = validateCustomThemeColors(row.colors);
  if (!colors) return null;
  const preset = buildCustomThemePreset({ id: row.id, name: row.name, colors });
  return {
    id: row.id,
    presetId: customThemePresetId(row.id),
    name: row.name,
    colors,
    swatches: preset.swatches,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Load theme settings + custom themes for the signed-in user. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  const [{ data: profile }, { data: customRows, error: customErr }] = await Promise.all([
    admin
      .from('profiles')
      .select('theme_preset_id, theme_color_scheme')
      .eq('id', user.id)
      .maybeSingle(),
    admin
      .from('user_custom_themes')
      .select('id, name, colors, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ]);

  if (customErr?.message?.includes('user_custom_themes')) {
    return NextResponse.json({
      presetId: profile?.theme_preset_id ?? null,
      colorScheme: (profile?.theme_color_scheme as ColorScheme | null) ?? null,
      customThemes: [],
      warning: 'Apply migration 0055_user_custom_themes.sql to persist custom themes',
    });
  }

  const customThemes = ((customRows ?? []) as CustomThemeRow[])
    .map(mapCustomTheme)
    .filter(Boolean);

  return NextResponse.json({
    presetId: profile?.theme_preset_id ?? null,
    colorScheme: (profile?.theme_color_scheme as ColorScheme | null) ?? null,
    customThemes,
  });
}

type PatchBody = {
  presetId?: string;
  colorScheme?: ColorScheme;
};

/** Save active preset + color scheme to the user profile. */
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const update: Record<string, string> = {};
  if (body.presetId?.trim()) update.theme_preset_id = body.presetId.trim();
  if (body.colorScheme === 'light' || body.colorScheme === 'dark') {
    update.theme_color_scheme = body.colorScheme;
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'presetId or colorScheme required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('profiles').update(update).eq('id', user.id);

  if (error) {
    if (error.message.includes('theme_')) {
      return NextResponse.json({
        ok: true,
        warning: 'Apply migration 0055_user_custom_themes.sql to persist theme settings',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; colors?: string[] };
  try {
    body = (await request.json()) as { name?: string; colors?: string[] };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const name = body.name?.trim();
  const colors = validateCustomThemeColors(body.colors ?? []);
  if (!name || name.length > 48) {
    return NextResponse.json({ error: 'Theme name is required (max 48 characters)' }, { status: 400 });
  }
  if (!colors) {
    return NextResponse.json({ error: 'Primary and accent hex colors are required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { count } = await admin
    .from('user_custom_themes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if ((count ?? 0) >= 8) {
    return NextResponse.json({ error: 'Maximum of 8 custom themes per account' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('user_custom_themes')
    .insert({
      user_id: user.id,
      name,
      colors,
    })
    .select('id, name, colors, created_at, updated_at')
    .single();

  if (error) {
    if (error.message.includes('user_custom_themes')) {
      return NextResponse.json(
        { error: 'Custom themes require migration 0055_user_custom_themes.sql' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = mapCustomTheme(data as CustomThemeRow);
  if (!mapped) return NextResponse.json({ error: 'Could not build theme' }, { status: 500 });

  await admin
    .from('profiles')
    .update({ theme_preset_id: mapped.presetId })
    .eq('id', user.id)
    .then(() => undefined, () => undefined);

  return NextResponse.json({ theme: mapped, presetId: mapped.presetId });
}
