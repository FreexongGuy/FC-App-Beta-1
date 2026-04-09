# FC App Bot Functions (OpenAI)

This folder contains a Firebase Cloud Function (`llmBot`) that turns chat `/bot ...` messages into GPT responses.

## What it does

- Listens for new Realtime Database entries at `bot_requests/{id}`.
- Reads shared user-taught knowledge from `bot_knowledge/items`.
- Calls OpenAI Responses API and writes the response back to `bot_requests/{id}/response`.
- Optional: set `bot_config/model` in Realtime Database to control which model is used (or pass `model` in the request payload).

## Deploy notes

- Store your OpenAI key as a Firebase Functions secret named `OPENAI_API_KEY`.
- Deploy the function using Firebase CLI from this repo.

## Security

- Never commit API keys to the repo (use Functions secrets).
- If a key is ever pasted into chat, logs, or a file in the repo, revoke it and create a new one.
