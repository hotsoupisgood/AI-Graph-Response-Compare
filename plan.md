# AI Comparison App - Implementation Plan

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS (minimal config for clean white/grey design)
- **Language**: TypeScript
- **Deployment**: Vercel (recommended)

---

## Project Structure
```
plot_compare/
├── app/
│   ├── page.tsx              # Main comparison page
│   ├── about/
│   │   └── page.tsx          # About page
│   ├── layout.tsx            # Root layout with nav
│   ├── globals.css           # Tailwind imports
│   └── api/
│       ├── analyze/
│       │   └── route.ts      # Endpoint to call all 3 AIs
│       └── sentiment/
│           └── route.ts      # Sentiment analysis endpoint
├── components/
│   ├── ImageUploader.tsx     # Upload button + preview
│   ├── ResponseCard.tsx      # AI response display card
│   └── SentimentBadge.tsx    # Sentiment indicator
├── lib/
│   ├── claude.ts             # Claude API wrapper
│   ├── openai.ts             # ChatGPT API wrapper
│   ├── grok.ts               # Grok API wrapper
│   └── sentiment.ts          # Sentiment analysis logic
├── .env.local                # API keys (never commit)
├── package.json
└── tailwind.config.js
```

---

## Implementation Steps

### Phase 1: Project Setup
1. Initialize Next.js project with TypeScript and Tailwind
2. Set up folder structure
3. Create `.env.local` for API keys
4. Build basic layout with navigation (Home, About)

### Phase 2: UI Components
1. Build `ImageUploader` component (drag & drop + click to upload)
2. Build `ResponseCard` component (displays AI name, response, loading state)
3. Build `SentimentBadge` component (positive/neutral/negative indicator)
4. Create main page layout with 3-column grid

### Phase 3: API Integration
1. Create Claude API wrapper (Anthropic SDK)
2. Create OpenAI API wrapper (OpenAI SDK)
3. Create Grok API wrapper (xAI API)
4. Build `/api/analyze` route that calls all 3 in parallel
5. Implement error handling for each provider

### Phase 4: Sentiment Analysis
1. Use one of the AIs (Claude recommended) to analyze sentiment
2. Or use a dedicated sentiment library
3. Display sentiment below each response

### Phase 5: Polish
1. Add loading states
2. Add error handling UI
3. Build About page
4. Test with various plot types
5. Deploy to Vercel

---

## API Keys - How to Get Them

### 1. Claude (Anthropic)
- **URL**: https://console.anthropic.com/
- **Steps**:
  1. Create an account at console.anthropic.com
  2. Go to "API Keys" in the left sidebar
  3. Click "Create Key"
  4. Copy the key (starts with `sk-ant-`)
- **Pricing**: Pay-per-use, ~$3/million input tokens for Claude 3.5 Sonnet
- **Free tier**: $5 free credits for new accounts
- **Env var**: `ANTHROPIC_API_KEY`

### 2. ChatGPT (OpenAI)
- **URL**: https://platform.openai.com/
- **Steps**:
  1. Create an account at platform.openai.com
  2. Go to "API Keys" in settings
  3. Click "Create new secret key"
  4. Copy the key (starts with `sk-`)
- **Pricing**: Pay-per-use, ~$2.50/million input tokens for GPT-4o
- **Free tier**: None currently (requires adding payment method)
- **Env var**: `OPENAI_API_KEY`

### 3. Grok (xAI)
- **URL**: https://console.x.ai/
- **Steps**:
  1. Create an account at console.x.ai
  2. Navigate to API section
  3. Generate an API key
  4. Copy the key
- **Pricing**: Pay-per-use, check current rates on their site
- **Free tier**: $25/month free credits for new accounts
- **Env var**: `XAI_API_KEY`

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# AI Provider API Keys
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-key-here
XAI_API_KEY=your-grok-key-here
```

**Important**:
- Never commit `.env.local` to git
- Next.js automatically loads this file
- Keys are only accessible server-side (in `/api` routes)

---

## API Usage Notes

### Image Handling
All three APIs support vision/image analysis:
- **Claude**: Send image as base64 in message content
- **ChatGPT**: Send image as base64 or URL in message content
- **Grok**: Send image as base64 in message content

### The Prompt
Same prompt for all three:
```
Interpret this plot. Describe what it shows, any trends, and key takeaways.
```

### Rate Limits
- Claude: 60 requests/minute (default)
- OpenAI: 60 requests/minute (default)
- Grok: Check current limits

---

## Cost Estimate
For a single plot analysis (assuming ~500 tokens response each):
- Claude: ~$0.002
- ChatGPT: ~$0.002
- Grok: ~$0.002

**Total per analysis**: ~$0.01 or less

---

## Next Steps
1. Get API keys from all three providers
2. Run: `npx create-next-app@latest . --typescript --tailwind --app`
3. Start building components

Ready to proceed when you have at least one API key to test with.
