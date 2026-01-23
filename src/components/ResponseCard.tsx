'use client';

interface ResponseCardProps {
  title: string;
  response: string | null;
  error: string | null;
  isLoading: boolean;
}

export default function ResponseCard({ title, response, error, isLoading }: ResponseCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 h-full flex flex-col">
      <h3 className="font-semibold text-lg mb-3 pb-2 border-b border-gray-100">{title}</h3>

      <div className="flex-1 min-h-[200px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-gray-400">Analyzing...</div>
          </div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : response ? (
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{response}</div>
        ) : (
          <div className="text-gray-400 text-sm">Upload an image to see analysis</div>
        )}
      </div>
    </div>
  );
}
