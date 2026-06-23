import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_PROMPT } from '@/lib/candid-pay/statementParser';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { pdf } = (await request.json()) as { pdf?: string };

    if (!pdf) {
      return Response.json({ error: 'No PDF data provided' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'Statement parsing is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdf,
              },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: 'No text response from model' }, { status: 500 });
    }

    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    return Response.json({ result });
  } catch (err) {
    console.error('[parse-statement] Error:', err);
    return Response.json(
      { error: 'Statement parsing failed. Please check the PDF and try again.' },
      { status: 500 }
    );
  }
}
