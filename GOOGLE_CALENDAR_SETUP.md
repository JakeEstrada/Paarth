# Google Calendar API Setup Guide

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it (e.g., "Paarth CRM")
4. Click "Create"

## Step 2: Enable Google Calendar API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure OAuth consent screen:
   - User Type: External (or Internal if using Google Workspace)
   - App name: "Paarth CRM"
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"
   - Scopes: Add `https://www.googleapis.com/auth/calendar`
   - Click "Save and Continue" through remaining steps
4. Back to Credentials:
   - Application type: "Web application"
   - Name: "Paarth CRM Web Client"
   - **Authorized redirect URIs** (click "+ Add URI" and add):
     - `http://localhost:4000/calendar/auth/callback` (for backend callback)
   - Click "Create"
5. Copy the **Client ID** and **Client Secret**

## Step 4: Add Credentials to .env

Add these to your `backend/.env` file:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:4000/calendar/auth/callback
```

**Note:** Make sure your backend server is running on port 4000. If you're using a different port, update the redirect URI accordingly.

## Step 5: Get Refresh Token

1. Start your backend server: `npm run dev`
2. Get the authorization URL:
   ```bash
   curl http://localhost:4000/calendar/auth-url
   ```
   Or visit: `http://localhost:4000/calendar/auth-url` in your browser
3. Copy the `authUrl` from the response
4. Open that URL in your browser
5. Sign in with your Google account
6. Grant permissions
7. You'll be redirected to a callback URL - copy the `code` parameter from the URL
8. Exchange the code for a refresh token:
   ```bash
   curl "http://localhost:4000/calendar/auth/callback?code=YOUR_CODE_HERE"
   ```
9. Copy the `refreshToken` from the response
10. Add it to your `.env`:
    ```env
    GOOGLE_REFRESH_TOKEN=your_refresh_token_here
    ```

## Step 6: Restart Backend Server

Restart your backend server to load the new environment variables.

## Step 7: Test the Integration

When you schedule a job on the calendar page, it should automatically sync to your Google Calendar!

## Troubleshooting

- **"Google Calendar not configured"**: Make sure all environment variables are set in `.env`
- **"Invalid credentials"**: Double-check your Client ID and Client Secret
- **"Refresh token expired"**: You may need to re-authenticate (refresh tokens can expire)
- **Events not appearing**: Check that the Calendar API is enabled in Google Cloud Console

