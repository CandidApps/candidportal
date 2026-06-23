import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACT_PROMPT = `Extract all readable text from this document for use as reference in a chat conversation.

Return plain text only — no markdown fences, no JSON, no commentary.
Preserve headings, lists, and tables as readable text.
If nothing is readable, return: (No readable text found)`;

export async function POST(request: Request) {
  try {
    const { data, mediaType, filename } = (await request.json()) as {
      data?: string;
      mediaType?: string;
      filename?: string;
    };

    if (!data || !mediaType) {
      return Response.json({ error: 'No document data provided' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'Document parsing is not configured.' },
        { status: 503 },
      );
    }

    const isPdf = mediaType === 'application/pdf';
    const isImage = mediaType.startsWith('image/');

    if (!isPdf && !isImage) {
      return Response.json({ error: 'Unsupported file type for server extraction' }, { status: 400 });
    }

    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      isPdf
        ? {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data,
            },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data,
            },
          },
      {
        type: 'text',
        text: `${EXTRACT_PROMPT}\n\nFilename: ${filename ?? 'unknown'}`,
      },
    ];

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const text =
      textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '(No readable text found)';

    return Response.json({ text });
  } catch (err) {
    console.error('[chat-attachment] Error:', err);
    return Response.json({ error: 'Could not read this file.' }, { status: 500 });
  }
}
