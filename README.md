So far, We are working on visualization (structure), leaving the functionality for soon.

✅ Login
✅ Styling
🔧 Chat
🔧 Calling
🔧 Announcements
🔧 Developer Utility

More will get released unscheduled to the README Page or the website.

## Chatbot (FCBot)

- In `chat.html`, users can run `/bot <question>` (private) and `/teach <fact>` (adds to shared knowledge in Firebase).
- Backend options:
  - Local Node server in `server/` (recommended for dev; no Firebase CLI login required).
  - Firebase Cloud Function in `functions/` (for production).

### Run local bot server

- Copy `/Users/hamza/Projects/FC-App/server/.env.example` to `/Users/hamza/Projects/FC-App/server/.env` and set `OPENAI_API_KEY`.
- Start (no `npm install` needed):
  - `cd /Users/hamza/Projects/FC-App/server && node index.js`
- Open `http://localhost:3000` and use `/bot ...` in Chat.

### Use Llama 3.1 8B (Ollama)

- Install and run Ollama, then pull the model:
  - `ollama pull llama3.1:8b-instruct`
- In `/Users/hamza/Projects/FC-App/server/.env` set:
  - `LLM_PROVIDER=ollama`
  - `OLLAMA_MODEL=llama3.1:8b-instruct`
