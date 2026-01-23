import Link from 'next/link';

export default function About() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-8">About AI Comparison</h1>

        <div className="space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold mb-3">Goal</h2>
            <p>
              This tool helps people understand that different AI systems can have
              different biases and interpretations when analyzing the same data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How it works</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>Upload a graph or plot image</li>
              <li>The same image is sent to multiple AI models with identical prompts</li>
              <li>Each AI interprets the plot independently</li>
              <li>Sentiment analysis shows the tone of each interpretation</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">The prompt</h2>
            <p className="mb-2">Every AI receives the exact same prompt:</p>
            <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm">
              &quot;Interpret this plot.&quot;
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Currently supported</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Claude (Anthropic)</li>
              <li>ChatGPT (OpenAI)</li>
              <li>Grok (xAI)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Source</h2>
            <p>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View on GitHub
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12">
          <Link href="/" className="text-blue-600 hover:underline">
            &larr; Back to comparison
          </Link>
        </div>
      </div>
    </main>
  );
}
