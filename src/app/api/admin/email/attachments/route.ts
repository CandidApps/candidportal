import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  downloadMessageAttachment,
  getMessageAttachments,
} from '@/lib/email/zoho';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';
import { resolveUploadContentType } from '@/lib/file-mime';

export const dynamic = 'force-dynamic';

/**
 * List or download Zoho Mail attachments for a message.
 * GET ?messageId=&folderId= → { attachments }
 * GET ?messageId=&folderId=&attachmentId=&download=1 → file bytes
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const messageId = url.searchParams.get('messageId')?.trim();
  const folderId = url.searchParams.get('folderId')?.trim();
  const attachmentId = url.searchParams.get('attachmentId')?.trim();
  const download = url.searchParams.get('download') === '1';

  if (!messageId || !folderId) {
    return NextResponse.json({ error: 'messageId and folderId required' }, { status: 400 });
  }

  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  if (!connection) {
    return NextResponse.json({ connected: false, attachments: [] });
  }

  try {
    if (download && attachmentId) {
      const file = await downloadMessageAttachment({
        accessToken: connection.accessToken,
        accountId: connection.accountId,
        folderId,
        messageId,
        attachmentId,
      });
      const attachments = await getMessageAttachments({
        accessToken: connection.accessToken,
        accountId: connection.accountId,
        folderId,
        messageId,
      });
      const meta = attachments.find((a) => a.attachmentId === attachmentId);
      const filename = meta?.attachmentName || 'attachment';
      // Zoho often returns text/html for binary attachments — trust the filename.
      const contentType = resolveUploadContentType(filename, file.contentType);
      return new NextResponse(file.bytes, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
          'Cache-Control': 'private, max-age=60',
        },
      });
    }

    const attachments = await getMessageAttachments({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      folderId,
      messageId,
    });
    return NextResponse.json({ connected: true, attachments });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load attachments' },
      { status: 502 },
    );
  }
}
