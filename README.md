# Zimba Chat

Zimba is a responsive chat interface backed by an OpenAI streaming endpoint.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Set `MONGODB_URI` and optionally `MONGODB_DB=zimba` to enable persistent conversation memory.
3. Set `OPENAI_API_KEY` to enable image generation. It remains server-side and is never sent to the browser.
4. Install dependencies with `npm install`.
5. Run the Vite frontend with `npm run dev`.

The Vite dev server serves the interface. The `/api/chat` serverless route is intended for Vercel deployment; use `vercel dev` locally when you want to exercise the real API route end to end.

## Deploy to Vercel

Import this project into Vercel and add `OPENAI_API_KEY` under Project Settings -> Environment Variables. Deploy normally. The `api/chat.js` function validates the model and conversation, adds Zimba's server-side behavior prompt, and streams the provider response to the browser.

Never put the API key or MongoDB URI in `index.html`, `script.js`, `dist/`, or a `VITE_*` variable. API usage can create provider charges. Add authentication, rate limiting, and usage limits before exposing this endpoint publicly.

## Persistent memory

When `MONGODB_URI` is configured, Zimba stores completed user/assistant exchanges in the `interactions` collection. Future requests retrieve relevant prior exchanges for the same browser session and provide them as context to Zimba. This is retrieval-augmented memory, not automatic model training; it does not change model weights. Without MongoDB, the app continues to work with browser-session memory only.

## Current limits

- The visible Zimba model names map to the configured provider model IDs.
- MongoDB memory is optional and scoped to the browser session ID sent by the client.
- Attachments are limited to 4 MB each. Images and small text files are supported.
- Model answers can be incomplete or incorrect; important information should be checked.
