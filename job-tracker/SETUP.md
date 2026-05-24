# Setup Guide

## 1. Get your Anthropic API key
1. Go to https://console.anthropic.com → API Keys → Create Key
2. Copy the key (starts with `sk-ant-...`)
3. In the project root: `cp config.example.js config.js`
4. Open `config.js` and paste your key

## 2. Google Cloud setup
1. Go to https://console.cloud.google.com → New Project → name it `job-tracker`
2. APIs & Services → Library → search `Google Sheets API` → Enable
3. APIs & Services → OAuth consent screen → External → fill in name + email → add yourself as Test User
4. Credentials → + Create Credentials → OAuth client ID → type: Chrome Extension
5. Leave Item ID blank for now (you need the Extension ID from step 3)

## 3. Get your Extension ID
1. Open Chrome → chrome://extensions → enable Developer mode
2. Load unpacked → select the `src/` folder
3. Copy the Extension ID shown under the extension name
4. Go back to step 2 → paste the ID into the Item ID field → Save
5. Copy the Client ID ending in `.apps.googleusercontent.com`
6. Open `src/manifest.json` → replace `YOUR_GOOGLE_OAUTH_CLIENT_ID` with your Client ID
7. Reload the extension on chrome://extensions

## 4. Add icons
Place these files in `src/icons/`:
- `icon16.png` (16×16)
- `icon48.png` (48×48)
- `icon128.png` (128×128)

## 5. Load the extension
1. chrome://extensions → Developer mode ON → Load unpacked → select `src/`
2. Pin the extension to your toolbar

## 6. First run
1. Click the Job Tracker icon → Connect with Google
2. Choose to create a new sheet or connect an existing one
3. Navigate to any job posting → click Track This Application
