# ASK ABHI – AI Chatbot (Google Gemini)

All-in-one chatbot with voice conversation, voice messages and replay, Study Hub, Mood Space, User/Admin roles, colour themes, chat history and Hindi / English / Hinglish support. The AI runs on the **Google Gemini API** through the official **`@google/genai`** SDK. The API key lives only on the server (`GEMINI_API_KEY`) and is never sent to the browser.

```
ask-abhi-chatbot/
├── public/                 the website (served as static files)
│   ├── index.html
│   ├── css/style.css
│   └── js/  config.js · app.js · features.js
├── api/                    Vercel serverless functions
│   ├── chat.js  config.js  health.js  admin/login.js
├── lib/core.js             Gemini call + admin login + settings storage (shared by local server and Vercel)
├── server.js               local server (npm start)
├── vercel.json             Vercel settings
├── package.json            dependency: @google/genai
├── .env.example            copy to .env
└── .gitignore  .vercelignore
```

## 1. Get a Gemini API key
1. Open https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
Keep it secret. The free tier has rate limits; check Google's current pricing and data-use terms for the tier you use.

## 2. Install Node.js (version 20 or newer)
**macOS** – download the LTS installer from https://nodejs.org, or with Homebrew: `brew install node`
**Windows** – download the LTS installer from https://nodejs.org, or in PowerShell: `winget install OpenJS.NodeJS.LTS`
Close and reopen the terminal, then check: `node -v` (must show v20 or higher).

## 3. Run locally

### macOS (Terminal)
```bash
cd ~/Downloads/ask-abhi-chatbot      # wherever you unzipped it
cp .env.example .env
nano .env                            # set GEMINI_API_KEY and ADMIN_PIN, save with Ctrl+O, Enter, Ctrl+X
npm install
npm start
```

### Windows (PowerShell)
```powershell
cd $HOME\Downloads\ask-abhi-chatbot  # wherever you unzipped it
copy .env.example .env
notepad .env                         # set GEMINI_API_KEY and ADMIN_PIN, then save
npm install
npm start
```
If PowerShell says scripts are disabled, either use **Command Prompt** (same commands, `cd %USERPROFILE%\Downloads\ask-abhi-chatbot`) or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Open **http://localhost:3000** in Chrome or Edge. Check http://localhost:3000/api/health: it should show `"geminiKeyConfigured": true`.

Optional – set variables for one terminal session instead of using `.env`:
- macOS: `export GEMINI_API_KEY="your_key"; export ADMIN_PIN="1234"; npm start`
- PowerShell: `$env:GEMINI_API_KEY="your_key"; $env:ADMIN_PIN="1234"; npm start`
- Command Prompt: `set GEMINI_API_KEY=your_key` then `set ADMIN_PIN=1234` then `npm start`

## 4. Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | Your Gemini API key (server only) |
| `ADMIN_PIN` | for admin | PIN for the 🛡 Admin login |
| `GEMINI_MODEL` | no | Default `gemini-2.5-flash`; change if you want another Gemini model |
| `ADMIN_SECRET` | no | Long random string used to sign admin sessions (recommended on Vercel) |
| `PORT` | no | Local port, default 3000 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) | Vercel admin settings | Added automatically when you connect Upstash Redis to the project |
| `APP_CONFIG` | no | JSON of admin settings, a read-only alternative to Redis |

## 5. Deploy on Vercel

### Option A – Dashboard
1. Put the project in a GitHub repository (`.env` and `node_modules` are already git-ignored).
2. On https://vercel.com/new import the repo. Framework preset: **Other**. Leave the build settings empty (`vercel.json` sets the `public` folder).
3. Under **Environment Variables** add `GEMINI_API_KEY` and `ADMIN_PIN` (and optionally `GEMINI_MODEL`, `ADMIN_SECRET`).
4. Click **Deploy**.

### Option B – CLI
```bash
npm i -g vercel
vercel login
vercel                      # first deploy, answer the prompts
vercel env add GEMINI_API_KEY
vercel env add ADMIN_PIN
vercel --prod
```

### Admin settings on Vercel
Vercel functions cannot write files, so saving Admin settings (app name, announcement, feature switches and so on) needs a small database. In your Vercel project open **Storage / Marketplace → Upstash Redis**, create it and connect it to the project, then **redeploy**. Until then everything else works, and *Save for all users* shows a clear message. Visit `/api/health` to see `settingsStorage`.

## 6. How it works
- The browser calls `POST /api/chat`. The server converts the conversation (the bot's instructions become Gemini's `systemInstruction`) and calls `ai.models.generateContent` with `GEMINI_API_KEY`.
- Admin login: `POST /api/admin/login` checks `ADMIN_PIN` and returns a signed 8-hour token (stateless, so it works on serverless). Only requests with a valid token can change settings.
- Chat history, nickname, theme, voice settings, moods and stats are stored in each user's own browser (localStorage). They are not on the server.
- Voice uses the browser's own speech recognition and speech synthesis, so use Chrome, Edge or Safari. Microphone access needs `localhost` or `https` (Vercel is https).

## 7. Troubleshooting
| Problem | Fix |
|---|---|
| "GEMINI_API_KEY is not set" | Create `.env` (local) or add the variable in Vercel, then restart / redeploy |
| "Gemini rejected the API key" | Re-copy the key from AI Studio, with no spaces or quotes |
| "rate limit or quota reached" | Wait a minute, or use a paid key / another model |
| "Gemini model not found" | Set `GEMINI_MODEL` to a model your key can use |
| Admin login says wrong PIN | `ADMIN_PIN` must be set on the server and match exactly |
| Port already in use | Set `PORT=3001` in `.env` |
| Mic does nothing | Allow microphone in the browser; use Chrome/Edge/Safari |

## Notes
- The bot has no live web search; it says so instead of inventing news. "Search this online" opens a Google link.
- The Mood Space is not therapy; the app says so and shows helpline info if a message suggests crisis.
