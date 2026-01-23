'use client';

interface Sentiment {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
}

interface SentimentChartProps {
  data: {
    name: string;
    sentiment: Sentiment | null;
  }[];
}

export default function SentimentChart({ data }: SentimentChartProps) {
  const hasData = data.some(d => d.sentiment !== null);

  if (!hasData) return null;

  // Find max absolute value for scaling
  const maxScore = Math.max(...data.filter(d => d.sentiment).map(d => Math.abs(d.sentiment!.score)), 0.5);

  const getBarColor = (score: number) => {
    if (score > 0.1) return 'bg-green-500';
    if (score < -0.1) return 'bg-red-500';
    return 'bg-gray-400';
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold text-lg mb-4">Sentiment Comparison</h3>
      <div className="space-y-3">
        {data.map(({ name, sentiment }) => (
          <div key={name} className="flex items-center gap-3">
            <div className="w-20 text-sm text-gray-600 shrink-0">{name}</div>
            <div className="flex-1 flex items-center">
              {sentiment ? (
                <>
                  <div className="flex-1 h-6 bg-gray-100 rounded relative">
                    {/* Center line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
                    {/* Bar */}
                    <div
                      className={`absolute top-1 bottom-1 rounded ${getBarColor(sentiment.score)}`}
                      style={{
                        left: sentiment.score >= 0 ? '50%' : `${50 - (Math.abs(sentiment.score) / maxScore) * 50}%`,
                        width: `${(Math.abs(sentiment.score) / maxScore) * 50}%`,
                      }}
                    />
                  </div>
                  <div className="w-12 text-right text-sm text-gray-500 shrink-0">
                    {sentiment.score.toFixed(2)}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-400">No data</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-2 px-20">
        <span>Negative</span>
        <span>Neutral</span>
        <span>Positive</span>
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Sentiment analyzed using{' '}
        <a
          href="https://github.com/cjhutto/vaderSentiment"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600"
        >
          VADER
        </a>
        {' '}(Valence Aware Dictionary and sEntiment Reasoner) — measures the emotional tone of each AI&apos;s interpretation, not the data itself.
      </p>
    </div>
  );
}
