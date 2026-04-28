# Discord Automod Badge Deployer

Automatically deploys AutoMod rules across your Discord servers to earn the **AutoMod Rule Creator** badge for your bot. Run one command, watch live progress in a Discord log channel, done.

---

## How it works

1. You add your bot to the target servers
2. Run `node index`
3. The bot deploys 6–9 AutoMod rules to every listed server, posting live progress to a Discord channel
4. The badge appears on your bot's profile page within ~12 hours

---

## Setup

### 1. Create a Discord bot

1. Open [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**
2. Go to **Bot** → click **Reset Token** → copy the token (you'll need it in step 3)
3. Under **Privileged Gateway Intents**, enable both **Server Members Intent** and **Message Content Intent**
4. Note your **Application ID** (General Information page) — you'll need it for invite links

> ⚠️ Never share your bot token. If it leaks, go to **Bot → Reset Token** immediately.

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Configure `.env`

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Then open `.env` and set:

| Variable | What to put |
|---|---|
| `BOT_TOKEN` | Your bot token from step 1 |
| `LOG_CHANNEL_ID` | ID of the channel where deployment logs appear |
| `STANDARD_SERVER_IDS` | Comma-separated IDs of servers that get **6 rules** |
| `MANY_SERVER_IDS` | Comma-separated IDs of servers that get **9 rules** |
| `BLOCKED_SERVER_IDS` | Servers the bot must never touch |
| `RULE_DELAY` | ms between each rule creation (default: `1500`) |
| `SERVER_DELAY` | ms between servers (default: `3000`) |

**How to copy a channel or server ID:** Enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click any channel/server and choose **Copy ID**.

---

### 4. Create servers and invite your bot

Create servers in Discord, then invite your bot to each one using this link:
```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot&permissions=8192
```
Replace `YOUR_APP_ID` with your Application ID from the Developer Portal. Add each server's ID to `STANDARD_SERVER_IDS` or `MANY_SERVER_IDS` in `.env`.

> The bot needs **Manage Server** permission (`8192`) to create AutoMod rules.

---

### 5. Set up a log channel

Create a text channel in any server the bot is already in, copy its ID, and set it as `LOG_CHANNEL_ID` in `.env`. This is where live deployment progress will appear.

---

### 6. Run the deployer

```bash
node index
```

The bot connects, deploys rules to all listed servers in order, posts live progress to the log channel, then exits. Check the log channel for a full breakdown.

---

## Rules deployed

### Standard set (6 rules) — `STANDARD_SERVER_IDS`

| Rule | Type | What it blocks |
|---|---|---|
| Block Harmful Content | Preset | Profanity, sexual content, slurs |
| Block Scam Messages | Keyword | Common giveaway/nitro scam phrases |
| Block Invite Links | Keyword | Discord invite links in all forms |
| Block Adult Content | Keyword | Adult content keywords |
| Block Harmful Language | Keyword | Self-harm and harassment phrases |
| Block Raids & Doxxing | Keyword | Raid coordination and doxxing phrases |

### Extended set (9 rules) — `MANY_SERVER_IDS`

All 6 standard rules plus:

| Rule | Type | What it blocks |
|---|---|---|
| Block Phishing | Keyword | Account verification scam phrases |
| Spam Protection | Anti-spam | Message spam |
| Mention Spam Protection | Mention limit | Mass pings (5+ mentions) |

---

## Manual command

`command/general/automod.js` contains a `!automod` prefix command for deploying rules to a single server on demand. It uses the same Components V2 progress display as the main deployer. To use it, wire the handler system to a separate bot entry point and configure `settings.json` with your prefix.

---

## Security

- `.env` is in `.gitignore` — your token is never committed to git
- `BLOCKED_SERVER_IDS` protects important servers from being modified
- The bot only creates AutoMod rules — it never deletes channels, bans members, or reads message content
- All credentials live in `.env`, nowhere else in the codebase
