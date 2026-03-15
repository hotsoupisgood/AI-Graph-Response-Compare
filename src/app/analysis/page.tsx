import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import SentimentErrorChart from '@/components/SentimentErrorChart';

type ModelStats = {
  n: number; mean: number; sd: number; median: number;
  ci_low: number; ci_high: number; min: number; max: number;
};

type WordOverlap = {
  top_n: number;
  top_words: Record<string, string[]>;
  pairwise: Record<string, { count: number; words: string[] }>;
  triple: { count: number; words: string[] };
};

type StatsJson = {
  image: string; prompt: string; n_runs: number; timestamp: string;
  models: Record<string, ModelStats>;
  kruskal_wallis: { H: number; p: number };
  pairwise: Record<string, { U: number; p_raw: number; p_bonf: number; r: number }>;
  word_overlap?: WordOverlap;
};

type ScoreRow = { run: number; Claude: number; ChatGPT: number; Grok: number };

function loadStats(): StatsJson | null {
  try {
    const p = path.join(process.cwd(), 'public', 'analysis', 'stats.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

function loadScores(): ScoreRow[] {
  try {
    const p = path.join(process.cwd(), 'public', 'analysis', 'scores.csv');
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n').slice(1); // skip header
    return lines.map(line => {
      const [run, Claude, ChatGPT, Grok] = line.trim().split(',').map(Number);
      return { run, Claude, ChatGPT, Grok };
    });
  } catch { return []; }
}

const COLOURS: Record<string, string> = {
  Claude: '#d97706', ChatGPT: '#16a34a', Grok: '#2563eb',
};

function fmt(n: number, decimals = 4) {
  if (n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(decimals);
}

function pFmt(p: number) {
  return p < 0.001 ? '<0.001' : p.toFixed(4);
}

function sigStars(p: number) {
  return p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';
}

export default function Analysis() {
  const stats  = loadStats();
  const scores = loadScores();

  if (!stats) {
    return (
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-12 text-gray-500">
          No analysis results found. Run <code>python analysis/run_analysis.py</code> first.
        </div>
      </main>
    );
  }

  const modelNames = Object.keys(stats.models);
  const runDate = new Date(stats.timestamp).toLocaleDateString('en-IE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Analysis</h1>
        <p className="text-gray-500 mb-10">
          Sentiment stability of AI plot interpretations across repeated trials.
        </p>

        {/* Methodology */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">What we did</h2>
          <div className="space-y-2 text-gray-700">
            <p>
              The example plot image (<span className="font-mono text-sm">{stats.image}</span>) was
              submitted to each model <strong>{stats.n_runs} times</strong> using the prompt{' '}
              <span className="font-mono text-sm">&quot;{stats.prompt}&quot;</span> at default
              temperature. Each response was scored with{' '}
              <a href="https://github.com/cjhutto/vaderSentiment" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:underline">VADER</a> — a rule-based sentiment
              analyser returning a compound score from &minus;1 to +1.
            </p>
            <p>
              Differences between models were tested with a <strong>Kruskal&ndash;Wallis test</strong>,
              followed by pairwise <strong>Mann&ndash;Whitney U</strong> tests with{' '}
              <strong>Bonferroni correction</strong>. Effect sizes are reported as rank-biserial
              correlation&nbsp;<em>r</em>. Analysis run: {runDate}.
            </p>
          </div>
        </section>

        {/* Sentiment errorbars plot */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Mean sentiment ± 95% CI</h2>
          <SentimentErrorChart
            n={stats.n_runs}
            data={modelNames.map(name => {
              const d = stats.models[name];
              return { model: name, mean: d.mean, error: d.ci_high - d.mean, color: COLOURS[name] };
            })}
          />
        </section>

        {/* Word frequency plot */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Top 20 words by model</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/analysis/word_frequency.png" alt="Word frequency chart"
            className="w-full rounded border border-gray-100" />
          <p className="text-xs text-gray-400 mt-1">Stop words removed.</p>
        </section>

        {/* Descriptive stats table */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Descriptive statistics</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  {['Model','Mean','SD','95% CI','Median','Min','Max'].map(h => (
                    <th key={h} className={`py-2 font-semibold text-gray-700 ${h === 'Model' ? 'text-left pr-4' : 'text-right px-3'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelNames.map(name => {
                  const d = stats.models[name];
                  return (
                    <tr key={name} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium" style={{ color: COLOURS[name] }}>{name}</td>
                      <td className="text-right py-2 px-3 font-mono">{fmt(d.mean)}</td>
                      <td className="text-right py-2 px-3 font-mono">{d.sd.toFixed(4)}</td>
                      <td className="text-right py-2 px-3 font-mono text-gray-500 text-xs">
                        [{fmt(d.ci_low, 3)}, +{d.ci_high.toFixed(3)}]
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-gray-500">{fmt(d.median)}</td>
                      <td className="text-right py-2 px-3 font-mono text-gray-500">{fmt(d.min)}</td>
                      <td className="text-right py-2 px-3 font-mono text-gray-500">{fmt(d.max)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Significance */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Significance tests</h2>
          <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm text-gray-700">
            <span className="font-semibold">Kruskal&ndash;Wallis:</span>{' '}
            H = {stats.kruskal_wallis.H.toFixed(3)},&ensp;
            p {pFmt(stats.kruskal_wallis.p)}&ensp;
            <span className="font-bold text-green-700">{sigStars(stats.kruskal_wallis.p)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  {['Comparison','p (Bonferroni)','Effect r',''].map(h => (
                    <th key={h} className={`py-2 font-semibold text-gray-700 ${h === 'Comparison' ? 'text-left pr-4' : 'text-right px-3'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.pairwise).map(([pair, r]) => (
                  <tr key={pair} className="border-b border-gray-100">
                    <td className="py-2 pr-4 text-gray-700">{pair}</td>
                    <td className="text-right py-2 px-3 font-mono">{pFmt(r.p_bonf)}</td>
                    <td className="text-right py-2 px-3 font-mono">{fmt(r.r, 3)}</td>
                    <td className="text-right py-2 px-3 font-bold text-green-700">{sigStars(r.p_bonf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            *** p &lt; 0.001 &nbsp;|&nbsp; r: |0.1| small &nbsp;|0.3| medium &nbsp;|0.5| large
          </p>
        </section>

        {/* Word overlap */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Shared vocabulary (top {stats.word_overlap?.top_n ?? 20} words)</h2>
          {stats.word_overlap ? (
            <>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 pr-4 font-semibold text-gray-700">Comparison</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Shared</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">of {stats.word_overlap.top_n}</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Words</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stats.word_overlap.pairwise).map(([pair, d]) => (
                      <tr key={pair} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-4 text-gray-700 whitespace-nowrap">{pair}</td>
                        <td className="text-right py-2 px-3 font-mono font-semibold">{d.count}</td>
                        <td className="text-right py-2 px-3 text-gray-400 font-mono">
                          {Math.round(d.count / stats.word_overlap!.top_n * 100)}%
                        </td>
                        <td className="py-2 px-3 text-gray-500 text-xs">{d.words.join(', ')}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 align-top bg-gray-50">
                      <td className="py-2 pr-4 font-semibold text-gray-700">All three</td>
                      <td className="text-right py-2 px-3 font-mono font-semibold">{stats.word_overlap.triple.count}</td>
                      <td className="text-right py-2 px-3 text-gray-400 font-mono">
                        {Math.round(stats.word_overlap.triple.count / stats.word_overlap.top_n * 100)}%
                      </td>
                      <td className="py-2 px-3 text-gray-500 text-xs">{stats.word_overlap.triple.words.join(', ')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">
                NLTK English stopwords removed, plus domain terms (plot, graph, data&hellip;). Words ranked by frequency across all 30 runs.
              </p>
            </>
          ) : (
            <p className="text-gray-400 text-sm">
              Re-run <code className="font-mono">python analysis/run_analysis.py</code> to populate word overlap data.
            </p>
          )}
        </section>

        {/* Raw scores */}
        {scores.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold mb-3">Raw scores</h2>
            <div className="overflow-x-auto max-h-64 border border-gray-100 rounded">
              <table className="w-full text-xs border-collapse font-mono">
                <thead className="sticky top-0 bg-white border-b border-gray-200">
                  <tr>
                    {['Run', 'Claude', 'ChatGPT', 'Grok'].map(h => (
                      <th key={h} className="text-right py-2 px-3 text-gray-600 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scores.map(row => (
                    <tr key={row.run} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="text-right py-1 px-3 text-gray-400">{row.run}</td>
                      <td className="text-right py-1 px-3" style={{ color: COLOURS.Claude }}>{fmt(row.Claude, 4)}</td>
                      <td className="text-right py-1 px-3" style={{ color: COLOURS.ChatGPT }}>{fmt(row.ChatGPT, 4)}</td>
                      <td className="text-right py-1 px-3" style={{ color: COLOURS.Grok }}>{fmt(row.Grok, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="mt-8 flex gap-6">
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            &larr; Back to comparison
          </Link>
          <a href="https://github.com/hotsoupisgood/AI-Graph-Response-Compare/blob/main/analysis/run_analysis.py"
            target="_blank" rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm">
            View analysis script &rarr;
          </a>
        </div>
      </div>
    </main>
  );
}
