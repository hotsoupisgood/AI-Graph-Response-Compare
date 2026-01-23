import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ratelimit, getIP } from '@/lib/ratelimit';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || process.env.AI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

const PROMPT = "Interpret this plot.";

async function analyzeWithClaude(base64Image: string, mediaType: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
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
            {
              type: "text",
              text: PROMPT,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text : 'No response generated';
  } catch (error) {
    console.error('Claude error:', error);
    throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function analyzeWithGPT(base64Image: string, mediaType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Image}`,
              },
            },
            {
              type: "text",
              text: PROMPT,
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content || 'No response generated';
  } catch (error) {
    console.error('GPT error:', error);
    throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function analyzeWithGrok(base64Image: string, mediaType: string): Promise<string> {
  try {
    const response = await xai.chat.completions.create({
      model: "grok-2-vision-1212",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Image}`,
              },
            },
            {
              type: "text",
              text: PROMPT,
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content || 'No response generated';
  } catch (error) {
    console.error('Grok error:', error);
    throw new Error(`Grok API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
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
      return NextResponse.json(
        { error: 'Image and mediaType are required' },
        { status: 400 }
      );
    }

    // Call all APIs in parallel
    const [claudeResult, gptResult, grokResult] = await Promise.allSettled([
      analyzeWithClaude(image, mediaType),
      analyzeWithGPT(image, mediaType),
      analyzeWithGrok(image, mediaType),
    ]);

    return NextResponse.json({
      claude: claudeResult.status === 'fulfilled'
        ? { success: true, response: claudeResult.value }
        : { success: false, error: claudeResult.reason?.message || 'Unknown error' },
      chatgpt: gptResult.status === 'fulfilled'
        ? { success: true, response: gptResult.value }
        : { success: false, error: gptResult.reason?.message || 'Unknown error' },
      grok: grokResult.status === 'fulfilled'
        ? { success: true, response: grokResult.value }
        : { success: false, error: grokResult.reason?.message || 'Unknown error' },
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze image' },
      { status: 500 }
    );
  }
}
