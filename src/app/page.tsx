'use client';

import { useState } from 'react';
import ImageUploader from '@/components/ImageUploader';
import ResponseCard from '@/components/ResponseCard';
import SentimentChart from '@/components/SentimentChart';

interface AIResponse {
  success: boolean;
  response?: string;
  error?: string;
}

interface Sentiment {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
}

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [claudeResponse, setClaudeResponse] = useState<AIResponse | null>(null);
  const [gptResponse, setGptResponse] = useState<AIResponse | null>(null);
  const [grokResponse, setGrokResponse] = useState<AIResponse | null>(null);
  const [claudeSentiment, setClaudeSentiment] = useState<Sentiment | null>(null);
  const [gptSentiment, setGptSentiment] = useState<Sentiment | null>(null);
  const [grokSentiment, setGrokSentiment] = useState<Sentiment | null>(null);

  const handleImageSelect = async (base64: string, type: string) => {
    setImage(base64);
    setIsLoading(true);
    setClaudeResponse(null);
    setGptResponse(null);
    setGrokResponse(null);
    setClaudeSentiment(null);
    setGptSentiment(null);
    setGrokSentiment(null);

    try {
      // Get AI analyses
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: type }),
      });

      const data = await analyzeRes.json();
      setClaudeResponse(data.claude);
      setGptResponse(data.chatgpt);
      setGrokResponse(data.grok);

      // Get sentiments for successful responses
      const textsToAnalyze: string[] = [];
      const indices: ('claude' | 'gpt' | 'grok')[] = [];

      if (data.claude?.success) {
        textsToAnalyze.push(data.claude.response);
        indices.push('claude');
      }
      if (data.chatgpt?.success) {
        textsToAnalyze.push(data.chatgpt.response);
        indices.push('gpt');
      }
      if (data.grok?.success) {
        textsToAnalyze.push(data.grok.response);
        indices.push('grok');
      }

      if (textsToAnalyze.length > 0) {
        const sentimentRes = await fetch('/api/sentiment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: textsToAnalyze }),
        });

        const sentimentData = await sentimentRes.json();

        indices.forEach((key, i) => {
          if (key === 'claude') {
            setClaudeSentiment(sentimentData.sentiments[i]);
          } else if (key === 'gpt') {
            setGptSentiment(sentimentData.sentiments[i]);
          } else {
            setGrokSentiment(sentimentData.sentiments[i]);
          }
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setClaudeResponse({ success: false, error: 'Failed to analyze' });
      setGptResponse({ success: false, error: 'Failed to analyze' });
      setGrokResponse({ success: false, error: 'Failed to analyze' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 text-center">
          <p className="text-gray-600">
            <span className="font-medium">1.</span> Upload a plot or graph{' '}
            <span className="text-gray-400 mx-2">→</span>
            <span className="font-medium">2.</span> Three AI models interpret it independently{' '}
            <span className="text-gray-400 mx-2">→</span>
            <span className="font-medium">3.</span> Compare responses and sentiment
          </p>
        </div>

        <div className="mb-8">
          <ImageUploader
            onImageSelect={handleImageSelect}
            currentImage={image}
            isLoading={isLoading}
          />
        </div>

        <div className="border-t border-gray-200 pt-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ResponseCard
              title="Claude"
              response={claudeResponse?.success ? claudeResponse.response ?? null : null}
              error={claudeResponse?.success === false ? claudeResponse.error ?? null : null}
              isLoading={isLoading}
            />
            <ResponseCard
              title="ChatGPT"
              response={gptResponse?.success ? gptResponse.response ?? null : null}
              error={gptResponse?.success === false ? gptResponse.error ?? null : null}
              isLoading={isLoading}
            />
            <ResponseCard
              title="Grok"
              response={grokResponse?.success ? grokResponse.response ?? null : null}
              error={grokResponse?.success === false ? grokResponse.error ?? null : null}
              isLoading={isLoading}
            />
          </div>
        </div>

        <div className="mt-8">
          <SentimentChart
            data={[
              { name: 'Claude', sentiment: claudeSentiment },
              { name: 'ChatGPT', sentiment: gptSentiment },
              { name: 'Grok', sentiment: grokSentiment },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
