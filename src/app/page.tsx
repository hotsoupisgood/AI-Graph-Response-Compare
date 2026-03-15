'use client';

import { useState } from 'react';
import ImageUploader from '@/components/ImageUploader';
import ResponseCard from '@/components/ResponseCard';
import SentimentChart from '@/components/SentimentChart';
import type { AIResponse } from '@/types';

type ModelKey = 'claude' | 'chatgpt' | 'grok';

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [responses, setResponses] = useState<Record<ModelKey, AIResponse | null>>({
    claude: null, chatgpt: null, grok: null,
  });

  const handleImageSelect = async (base64: string, type: string) => {
    setImage(base64);
    setIsLoading(true);
    setResponses({ claude: null, chatgpt: null, grok: null });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: type }),
      });
      if (res.ok) {
        setResponses(await res.json());
      } else {
        const err: AIResponse = { success: false, error: 'Failed to analyze' };
        setResponses({ claude: err, chatgpt: err, grok: err });
      }
    } catch {
      const err: AIResponse = { success: false, error: 'Failed to analyze' };
      setResponses({ claude: err, chatgpt: err, grok: err });
    } finally {
      setIsLoading(false);
    }
  };

  const hasResults = isLoading || Object.values(responses).some(Boolean);

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
          {hasResults && (
            <p className="text-gray-600 mb-6 text-center">
              We asked 3 LLMs this prompt about your plot:{' '}
              <span className="font-medium text-gray-900">&ldquo;Interpret this plot.&rdquo;</span>
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ResponseCard title="Claude" data={responses.claude} isLoading={isLoading} />
            <ResponseCard title="ChatGPT" data={responses.chatgpt} isLoading={isLoading} />
            <ResponseCard title="Grok" data={responses.grok} isLoading={isLoading} />
          </div>
        </div>

        <div className="mt-8">
          <SentimentChart data={[
            { name: 'Claude', sentiment: responses.claude?.sentiment },
            { name: 'ChatGPT', sentiment: responses.chatgpt?.sentiment },
            { name: 'Grok', sentiment: responses.grok?.sentiment },
          ]} />
        </div>
      </div>
    </main>
  );
}
