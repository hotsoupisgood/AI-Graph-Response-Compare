import { NextRequest, NextResponse } from 'next/server';
import vader from 'vader-sentiment';

function analyzeSentiment(text: string): { sentiment: string; score: number } {
  const intensity = vader.SentimentIntensityAnalyzer.polarity_scores(text);

  // compound score ranges from -1 (most negative) to +1 (most positive)
  const score = intensity.compound;

  let sentiment: 'positive' | 'neutral' | 'negative';
  if (score >= 0.05) {
    sentiment = 'positive';
  } else if (score <= -0.05) {
    sentiment = 'negative';
  } else {
    sentiment = 'neutral';
  }

  return { sentiment, score };
}

export async function POST(request: NextRequest) {
  try {
    const { texts } = await request.json();

    if (!texts || !Array.isArray(texts)) {
      return NextResponse.json(
        { error: 'texts array is required' },
        { status: 400 }
      );
    }

    const results = texts.map((text: string) => analyzeSentiment(text));

    return NextResponse.json({ sentiments: results });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze sentiment' },
      { status: 500 }
    );
  }
}
