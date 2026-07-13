import Anthropic from '@anthropic-ai/sdk';
import 'server-only';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CONVERT_PROMPT = `Convert this marketing PDF into a clean HTML email template suitable for outbound email.

Requirements:
- Return ONLY valid HTML (no markdown fences, no commentary)
- Use inline CSS styles only (email-client safe)
- Preserve headings, key copy, bullet lists, and call-to-action buttons/links
- Use placeholder links like href="#" for CTAs when the PDF has buttons
- Include a simple responsive wrapper table layout
- Brand tone: professional, clear, modern
- If the PDF is mostly images with little text, describe sections and add placeholder copy where needed`;

export async function convertPdfBufferToEmailHtml(buffer: Buffer, filename: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('PDF conversion is not configured (missing ANTHROPIC_API_KEY).');
  }

  const data = buffer.toString('base64');
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data,
            },
          },
          {
            type: 'text',
            text: `${CONVERT_PROMPT}\n\nSource filename: ${filename}`,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  const html = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
  if (!html) {
    throw new Error('Could not generate an email template from this PDF.');
  }
  return html.replace(/^```html\s*/i, '').replace(/\s*```$/i, '').trim();
}
