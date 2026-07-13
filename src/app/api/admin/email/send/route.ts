import { NextResponse } from 'next/server';
import { canAccessMarketingHub } from '@/lib/auth/staff';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchMarketingAssetFiles } from '@/lib/marketing-hub-server';
import { sendMail, uploadZohoAttachment } from '@/lib/email/zoho';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await canAccessMarketingHub())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    html?: string;
    text?: string;
    marketingAssetIds?: string[];
  };

  const to = body.to?.trim();
  if (!to) return NextResponse.json({ error: 'Missing recipient' }, { status: 400 });
  const subject = body.subject?.trim() || '(no subject)';
  const content = body.html ?? body.text ?? '';
  const mailFormat = body.html ? 'html' : 'plaintext';

  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  if (!connection) {
    return NextResponse.json(
      { error: 'No Zoho mailbox connected. Connect your mailbox from the account menu.' },
      { status: 409 },
    );
  }

  try {
    const marketingAssetIds = (body.marketingAssetIds ?? []).filter(Boolean);
    const attachments = [];
    if (marketingAssetIds.length) {
      const files = await fetchMarketingAssetFiles(marketingAssetIds);
      for (const file of files) {
        const uploaded = await uploadZohoAttachment({
          accessToken: connection.accessToken,
          accountId: connection.accountId,
          filename: file.filename,
          buffer: file.buffer,
          contentType: file.mimeType,
        });
        attachments.push(uploaded);
      }
    }

    await sendMail({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      fromAddress: connection.email,
      toAddress: to,
      ccAddress: body.cc?.trim() || undefined,
      bccAddress: body.bcc?.trim() || undefined,
      subject,
      content,
      mailFormat,
      attachments: attachments.length ? attachments : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Send failed' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentFrom: connection.email });
}
