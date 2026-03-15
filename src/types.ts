export interface Sentiment {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
}

export interface AIResponse {
  success: boolean;
  response?: string;
  error?: string;
  sentiment?: Sentiment;
}
