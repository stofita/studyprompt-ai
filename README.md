# StudyPrompt AI — Deployment Guide

## Project structure
```
studyprompt-ai/
├── index.html                  ← The tool students see
├── netlify.toml                ← Netlify config
├── netlify/functions/
│   └── generate.js             ← Backend (hides your API key)
└── README.md
```

## Step 1 — Push to GitHub
1. Create a new GitHub repo called `studyprompt-ai`
2. Upload all these files to the repo (drag and drop on GitHub works)

## Step 2 — Connect to Netlify
1. Go to netlify.com → Add new site → Import from GitHub
2. Select your `studyprompt-ai` repo
3. Build settings: leave everything blank (no build command needed)
4. Click Deploy

## Step 3 — Add your API key (IMPORTANT)
1. In Netlify → Site settings → Environment variables
2. Click "Add variable"
3. Key: `XAI_API_KEY`
4. Value: your xAI API key (paste it here, never in the code)
5. Save

## Step 4 — Redeploy
1. Go to Deploys → Trigger deploy → Deploy site
2. Wait ~30 seconds → your site is live

## Step 5 — Test it
1. Open your Netlify URL
2. Fill in subject + task → click Generate
3. Should return prompts in 10-15 seconds

## Step 6 — Add to Payhip
1. Copy your Netlify URL (e.g. https://studyprompt-ai.netlify.app)
2. Go to Payhip → your membership product
3. Paste the URL in the welcome email as the access link
4. Subscribers get the link after paying

## Pricing suggestion
- $6/month or $49/year

## Support email
Update the footer in index.html with your real email address.
