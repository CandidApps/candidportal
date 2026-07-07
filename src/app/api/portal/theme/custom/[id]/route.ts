import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildCustomThemePreset,
  customThemePresetId,
  parseCustomThemePresetId,
  validateCustomThemeColors,
} from '@/lib/themes/build-custom-preset';
import { DEFAULT_THEME_PRESET_ID } from '@/lib/themes/presets';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
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

  const update: Record<string, unknown> = {};
  if (body.name?.trim()) {
    const name = body.name.trim();
    if (name.length > 48) {
      return NextResponse.json({ error: 'Theme name max 48 characters' }, { status: 400 });
    }
    update.name = name;
  }
  if (body.colors) {
    const colors = validateCustomThemeColors(body.colors);
    if (!colors) {
      return NextResponse.json({ error: 'Primary and accent hex colors required' }, { status: 400 });
    }
    update.colors = colors;
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'name or colors required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('user_custom_themes')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, colors, created_at, updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const colors = validateCustomThemeColors(data.colors as string[]);
  if (!colors) return NextResponse.json({ error: 'Invalid stored colors' }, { status: 500 });

  buildCustomThemePreset({ id: data.id as string, name: data.name as string, colors });

  return NextResponse.json({
    theme: {
      id: data.id,
      presetId: customThemePresetId(data.id as string),
      name: data.name,
      colors,
    },
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const presetId = customThemePresetId(id);

  const { data: profile } = await admin
    .from('profiles')
    .select('theme_preset_id')
    .eq('id', user.id)
    .maybeSingle();

  const { error } = await admin
    .from('user_custom_themes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (profile?.theme_preset_id === presetId) {
    await admin
      .from('profiles')
      .update({ theme_preset_id: DEFAULT_THEME_PRESET_ID })
      .eq('id', user.id);
  }

  return NextResponse.json({ ok: true, fallbackPresetId: DEFAULT_THEME_PRESET_ID });
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const presetUuid = parseCustomThemePresetId(id) ?? id;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('user_custom_themes')
    .select('id, name, colors, created_at, updated_at')
    .eq('id', presetUuid)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const colors = validateCustomThemeColors(data.colors as string[]);
  if (!colors) return NextResponse.json({ error: 'Invalid colors' }, { status: 500 });

  return NextResponse.json({
    theme: {
      id: data.id,
      presetId: customThemePresetId(data.id as string),
      name: data.name,
      colors,
    },
  });
}
