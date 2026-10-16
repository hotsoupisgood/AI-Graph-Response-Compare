# AI Comparison

## Basic template
-----------------
Upload Button/ Uploaded image
----------------
Claude Reponse|ChatGpt|Grok
---------------
claude sentiment|gpt sentiment|grok sentiment

## Description
1. Uplaod a graph
2. Make claude, chatgpt, grok, interpret the plot, with the SAME prompt. "Interpret this plot"
3. Get sentiment for each interpretation.
4. Make simple white interface with grey line seperating sections. simple minimalist design.

## Goal
Goals is the have people understand that different ai's can have different biases

## Other tabs
About page with goal. link to github.

## Frameworks
Reccomend me one.
If not a obvious solution. Use Reactive Java backend and vue frontend.

## Setup & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Then open http://localhost:3000 in your browser.

## Environment Variables

Create a `.env.local` file with your API keys:

```
ANTHROPIC_API_KEY=your-claude-key
OPENAI_API_KEY=your-openai-key
```

## Powered experiment & results page

`analysis_power/` holds the pre-registered follow-up experiment: 250 responses per
model per chart for Claude Opus 5, GPT-5.5 and Grok 4.7, VADER-scored, with
pairwise Mann-Whitney tests. See `analysis_power/STEPS.md` for the one-page
version and `analysis_power/DETAILED_PLAN.md` for the design, decisions and run log.

```bash
cd analysis_power
python power_analysis.py          # sample-size calculation from existing variance
python power_study.py --n 250     # collect (resumable; needs .env.local keys)
python analyse_power_study.py     # tests, plots, and data for the results page
```

`docs/` is a static d3 page that tells the experiment as a live flowchart and
lets you read every response. Serve it from any static host (GitHub Pages from
`/docs`). No keys or private
data are in it: only model outputs, scores and the four chart images.
