# GitHub Actions Secrets Setup Guide

This guide explains how to configure GitHub Actions secrets to automatically inject API keys when bringing the application online.

## Required Secrets

Add these secrets to your GitHub repository:
**Settings > Secrets and variables > Actions > Secrets**

### API Keys (Required)
- `OPENAI_API_KEY` - Your OpenAI API key
- `DEEPGRAM_API_KEY` - Your Deepgram API key  
- `ASSEMBLYAI_API_KEY` - Your AssemblyAI API key

### Optional Variables
**Settings > Secrets and variables > Actions > Variables**
- `REACT_APP_SERVER_URL` - Server URL (defaults to `https://syncscribe.app`)

## How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Enter the secret name (e.g., `OPENAI_API_KEY`)
5. Enter the secret value
6. Click **Add secret**
7. Repeat for all required secrets

## How It Works

When you run the `deploy-online` workflow:

1. GitHub Actions reads the secrets
2. The secrets are passed as environment variables to `deploy-online.sh`
3. The script creates/updates the `.env` file on the VM with these values
4. Docker Compose reads the `.env` file and starts containers with the API keys

## Security Notes

- ✅ Secrets are encrypted and never exposed in logs
- ✅ Secrets are only available to workflows (not in code)
- ✅ The `.env` file is created on the VM, not committed to Git
- ✅ API keys are base64 encoded when passed through SSH for safety

## Verification

After running `deploy-online`, check the workflow logs for:
```
✓ .env file created from environment variables
Environment variables in .env:
OPENAI_API_KEY=***
DEEPGRAM_API_KEY=***
ASSEMBLYAI_API_KEY=***
REACT_APP_SERVER_URL=https://syncscribe.app
```

## Troubleshooting

### Secrets Not Working

1. **Check secret names**: Must match exactly (case-sensitive)
   - `OPENAI_API_KEY` ✅
   - `openai_api_key` ❌

2. **Verify secrets exist**: Go to Settings > Secrets and variables > Actions > Secrets

3. **Check workflow logs**: Look for "Creating/updating .env file from environment variables"

4. **Manual fallback**: Use `./scripts/upload-env.sh` to upload `.env` manually

### Missing API Keys

If you see:
```
⚠ WARNING: .env file not found - API keys are missing!
```

Either:
- Add the secrets to GitHub Actions (recommended)
- Or manually upload `.env` using `./scripts/upload-env.sh`

