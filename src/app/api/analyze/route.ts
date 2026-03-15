import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import vader from 'vader-sentiment';
import { ratelimit, getIP } from '@/lib/ratelimit';
import type { AIResponse, Sentiment } from '@/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || process.env.AI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

const PROMPT = "Interpret this plot.";
const VALID_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function scoreSentiment(text: string): Sentiment {
  const compound = vader.SentimentIntensityAnalyzer.polarity_scores(text)?.compound ?? 0;
  return {
    sentiment: compound >= 0.05 ? 'positive' : compound <= -0.05 ? 'negative' : 'neutral',
    score: compound,
  };
}

async function analyzeWithClaude(base64Image: string, mediaType: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64Image,
          },
        },
        { type: "text", text: PROMPT },
      ],
    }],
  });
  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : 'No response generated';
}

async function analyzeWithOpenAICompat(client: OpenAI, model: string, base64Image: string, mediaType: string): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64Image}` } },
        { type: "text", text: PROMPT },
      ],
    }],
  });
  return response.choices[0]?.message?.content || 'No response generated';
}

function toResult(result: PromiseSettledResult<string>, providerName: string): AIResponse {
  if (result.status === 'fulfilled') {
    return { success: true, response: result.value, sentiment: scoreSentiment(result.value) };
  }
  console.error(`${providerName} error:`, result.reason);
  return { success: false, error: (result.reason as Error)?.message || 'Unknown error' };
}

export async function POST(request: NextRequest) {
  const ip = getIP(request);
  const { success, remaining } = await ratelimit(ip);
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: { 'X-RateLimit-Remaining': remaining.toString() } }
    );
  }

  const { image, mediaType } = await request.json();

  if (!image || !mediaType) {
    return NextResponse.json({ error: 'Image and mediaType are required' }, { status: 400 });
  }

  if (!VALID_MEDIA_TYPES.has(mediaType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  const [claudeResult, gptResult, grokResult] = await Promise.allSettled([
    analyzeWithClaude(image, mediaType),
    analyzeWithOpenAICompat(openai, 'gpt-4o', image, mediaType),
    analyzeWithOpenAICompat(xai, 'grok-2-vision-1212', image, mediaType),
  ]);

  return NextResponse.json({
    claude: toResult(claudeResult, 'Claude'),
    chatgpt: toResult(gptResult, 'ChatGPT'),
    grok: toResult(grokResult, 'Grok'),
  });
}
