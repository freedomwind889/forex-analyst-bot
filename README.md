# Forex Analyst Bot

A Cloudflare Worker-based LINE Bot for multi-timeframe technical analysis of forex charts using AI (Gemini).

## Features

- **Top-Down Analysis**: Strict hierarchical analysis from higher timeframes to lower.
- **Multi-Timeframe Support**: Handles M1, M5, M15, M30, H1, H4, 1D, 1W.
- **Data Freshness**: Enforces validity periods for each timeframe.
- **Interactive Management**: Edit, delete, or change timeframes of stored analyses.
- **Database**: Uses Cloudflare D1 for persistent storage.
- **Secure**: Verifies LINE signatures.
- **Agentic Q&A**: DB-first chat responses.
- **Background Processing**: FIFO queue for image analysis to handle multiple uploads.

## Setup

1. **Install Wrangler**:
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler auth login
   ```

3. **Create D1 Database**:
   ```bash
   wrangler d1 create forex_analysis_db
   ```
   Update `wrangler.toml` with the database ID.

4. **Set Secrets**:
   ```bash
   wrangler secret put LINE_CHANNEL_SECRET
   wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   wrangler secret put GEMINI_API_KEY
   wrangler secret put MODEL_ID  # Required: e.g., gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash
   wrangler secret put INTERNAL_TASK_TOKEN
   ```

5. **Deploy**:
   ```bash
   wrangler deploy
   ```

6. **Set Webhook in LINE Developers Console**:
   Point to your Worker's URL.

## Environment Variables

- `LINE_CHANNEL_SECRET`: For signature verification.
- `LINE_CHANNEL_ACCESS_TOKEN`: For sending messages.
- `GEMINI_API_KEY`: Google Gemini API key.
- `MODEL_ID`: Gemini model ID (default: gemma-3-27b-it).
- `INTERNAL_TASK_TOKEN`: Optional token for internal calls.
- `FAST_ANALYSIS_DEADLINE_MS`: Timeout for fast-path analysis (default: 18000ms).
- `AI_MAX_OUTPUT_TOKENS`: Max tokens for AI responses (default: 1800).
- `INTERNAL_AI_TIMEOUT_MS`: Timeout for background analysis (default: 24000ms).
- `INTERNAL_MAX_RETRY`: Max retries for failed analyses (default: 3).
- `EST_SECONDS_PER_IMAGE`: Estimated seconds per image for ETA (default: 45).

## Usage

- Send chart images to the bot.
- Use menus: Status, Summary, Trade Style, Manage Data.
- Chat with the bot for DB-first Q&A.

## Development

To run locally:
```bash
wrangler dev
```

Ensure you have the D1 database and secrets set.