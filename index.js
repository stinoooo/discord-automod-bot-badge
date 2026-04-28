require('dotenv').config();

const { Client }  = require('discord.js');
const { REST }    = require('@discordjs/rest');
const { Routes }  = require('discord-api-types/v9');
const chalk       = require('chalk');

// ── Config ────────────────────────────────────────────────────────────────────

const TOKEN          = process.env.BOT_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const RULE_DELAY     = parseInt(process.env.RULE_DELAY   ?? '1500', 10);
const SERVER_DELAY   = parseInt(process.env.SERVER_DELAY ?? '3000',  10);

if (!TOKEN || TOKEN === 'PASTE_YOUR_NEW_TOKEN_HERE') {
    console.error(chalk.red('[ERROR] BOT_TOKEN is missing or not set in .env — see README.md'));
    process.exit(1);
}
if (!LOG_CHANNEL_ID) {
    console.error(chalk.red('[ERROR] LOG_CHANNEL_ID is not set in .env'));
    process.exit(1);
}

// ── Server lists ──────────────────────────────────────────────────────────────

const parseIds       = key => (process.env[key] ?? '').split(',').map(s => s.trim()).filter(Boolean);
const STANDARD       = parseIds('STANDARD_SERVER_IDS');
const MANY           = parseIds('MANY_SERVER_IDS');
const BLOCKED        = new Set(parseIds('BLOCKED_SERVER_IDS'));

const TARGET_SERVERS = [
    ...STANDARD.map(id => ({ id, many: false })),
    ...MANY.map(id =>     ({ id, many: true  })),
];

// ── Automod rule definitions ──────────────────────────────────────────────────

const STANDARD_RULES = [
    { name: 'Block Harmful Content',   eventType: 1, triggerType: 4, triggerMetadata: { presets: [1, 2, 3] } },
    { name: 'Block Scam Messages',     eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['free nitro', 'discord nitro free', 'steam gift', 'claim your prize', 'you won a gift'] } },
    { name: 'Block Invite Links',      eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['discord.gg/*', 'dsc.gg/*', 'discord.com/invite/*', 'discordapp.com/invite/*'] } },
    { name: 'Block Adult Content',     eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['porn', 'pornhub', 'onlyfans', 'nude pics', 'nudes'] } },
    { name: 'Block Harmful Language',  eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['kys', 'kill yourself', 'neck yourself', 'go kill yourself', 'end your life'] } },
    { name: 'Block Raids & Doxxing',   eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['raid this server', 'join the raid', 'mass report', 'doxxed', 'found your ip', 'swat'] } },
];

const EXTRA_RULES = [
    { name: 'Block Phishing',          eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['verify your account', 'your account will be banned', 'click here to claim', 'limited offer'] } },
    { name: 'Spam Protection',         eventType: 1, triggerType: 3, triggerMetadata: {} },
    { name: 'Mention Spam Protection', eventType: 1, triggerType: 5, triggerMetadata: { mentionTotalLimit: 5 } },
];

const MANY_RULES   = [...STANDARD_RULES, ...EXTRA_RULES];
const BLOCK_ACTION = [{ type: 1, metadata: { customMessage: 'This message has been blocked by AutoMod.' } }];

// ── Utilities ─────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rest  = new REST({ version: '9' }).setToken(TOKEN);

function progressBar(done, total, width = 20) {
    const filled = Math.round((width * done) / total);
    return `\`[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]\` **${done}/${total}**`;
}

// ── Components V2 ─────────────────────────────────────────────────────────────

const CV2_FLAGS = 32768;

const txt = content                       => ({ type: 10, content });
const sep = (divider = true, spacing = 1) => ({ type: 14, divider, spacing });
const box = (accentColor, ...components)  => ({ type: 17, accent_color: accentColor, components });

async function sendMsg(channelId, components) {
    return rest.post(Routes.channelMessages(channelId), {
        body: { flags: CV2_FLAGS, components },
    });
}

async function editMsg(channelId, messageId, components) {
    return rest.patch(Routes.channelMessage(channelId, messageId), {
        body: { components },
    }).catch(() => {});
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildProgress(results, total, totalRules) {
    const done     = results.length;
    const lines    = results.map(r =>
        r.skipped
            ? `⚠️  \`${r.id}\` — not in guild cache`
            : r.added.length
                ? `✅  **${r.name}** — ${r.added.length} rule${r.added.length !== 1 ? 's' : ''}` +
                  (r.failed.length ? ` *(${r.failed.length} failed)*` : '')
                : `❌  **${r.name}** — all rules failed`
    );
    const visible  = lines.slice(-10);
    const overflow = lines.length > 10 ? `\n*…and ${lines.length - 10} more above*` : '';
    return [box(0x5865F2,
        txt(`## 🤖 Automod Deployer\n${progressBar(done, total)}`),
        sep(),
        txt(visible.length ? visible.join('\n') + overflow : '*Starting deployment…*'),
        sep(),
        txt(`-# ${done}/${total} servers · ${totalRules} rules added total`),
    )];
}

function buildServerResult(guildName, id, added, failed) {
    const ok        = added.length > 0;
    const rulesText = added.length
        ? `**Rules added (${added.length}):**\n${added.map(r => `• ${r}`).join('\n')}`
        : '*No rules were added.*';
    const failText  = failed.length
        ? `\n\n**Failed (${failed.length}):**\n${failed.map(r => `• ${r.name} — \`${r.reason}\``).join('\n')}`
        : '';
    return [box(ok ? 0x57F287 : 0xED4245,
        txt(`${ok ? '✅' : '❌'} **${guildName}** — \`${id}\``),
        sep(),
        txt(rulesText + failText),
    )];
}

function buildSummary(results, totalRules) {
    const processed  = results.filter(r => !r.skipped);
    const withRules  = processed.filter(r => r.added.length > 0);
    const skipped    = results.filter(r => r.skipped);
    const statsLines = [
        `**${totalRules} rules** added across **${withRules.length}** server${withRules.length !== 1 ? 's' : ''}`,
        skipped.length ? `**${skipped.length}** server${skipped.length !== 1 ? 's' : ''} skipped (bot not present)` : null,
    ].filter(Boolean).join('\n');
    const breakdown  = processed.length
        ? processed.map(r =>
            `• **${r.name}** — ${r.added.length} rules` +
            (r.failed.length ? ` *(${r.failed.length} failed)*` : '')
          ).join('\n')
        : '*No servers were processed.*';
    return [box(0xFFD700,
        txt(`## 🎉 Deployment Complete!`),
        sep(),
        txt(statsLines),
        sep(),
        txt(`**Breakdown:**\n${breakdown}`),
        sep(),
        txt(`-# The AutoMod badge typically appears on your bot's page within 12 hours.`),
    )];
}

// ── Deploy logic ──────────────────────────────────────────────────────────────

const client = new Client({ intents: 32767 });

async function deployToServer(guild, rules) {
    const added  = [];
    const failed = [];
    for (const def of rules) {
        try {
            await guild.autoModerationRules.create({
                name:            def.name,
                enabled:         true,
                eventType:       def.eventType,
                triggerType:     def.triggerType,
                triggerMetadata: def.triggerMetadata,
                actions:         BLOCK_ACTION,
            });
            added.push(def.name);
            console.log(chalk.green(`    ✓ ${def.name}`));
        } catch (err) {
            failed.push({ name: def.name, reason: err.message });
            console.log(chalk.red(`    ✗ ${def.name}: ${err.message}`));
        }
        await sleep(RULE_DELAY);
    }
    return { added, failed };
}

async function run() {
    const total      = TARGET_SERVERS.length;
    let   totalRules = 0;
    const results    = [];

    if (total === 0) {
        console.log(chalk.yellow('[WARN] No target servers configured in .env'));
        return;
    }

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isText()) {
        console.error(chalk.red(`[ERROR] Log channel ${LOG_CHANNEL_ID} not found or is not a text channel`));
        process.exit(1);
    }

    const progressMsg = await sendMsg(LOG_CHANNEL_ID, buildProgress([], total, 0));
    const progressId  = progressMsg.id;

    for (let i = 0; i < TARGET_SERVERS.length; i++) {
        const { id, many } = TARGET_SERVERS[i];

        if (BLOCKED.has(id)) {
            console.log(chalk.red(`[${i + 1}/${total}] BLOCKED ${id} — skipping`));
            results.push({ id, skipped: true });
            await editMsg(LOG_CHANNEL_ID, progressId, buildProgress(results, total, totalRules));
            continue;
        }

        const guild = client.guilds.cache.get(id);
        if (!guild) {
            console.log(chalk.yellow(`[${i + 1}/${total}] ${id} — not in guild cache, skipping`));
            results.push({ id, skipped: true });
            await editMsg(LOG_CHANNEL_ID, progressId, buildProgress(results, total, totalRules));
            continue;
        }

        const ruleSet = many ? MANY_RULES : STANDARD_RULES;
        console.log(chalk.blue(`\n[${i + 1}/${total}] ${guild.name} (${id}) — deploying ${ruleSet.length} rules`));

        const { added, failed } = await deployToServer(guild, ruleSet);
        totalRules += added.length;
        results.push({ id, name: guild.name, added, failed, skipped: false });

        await Promise.all([
            editMsg(LOG_CHANNEL_ID, progressId, buildProgress(results, total, totalRules)),
            sendMsg(LOG_CHANNEL_ID, buildServerResult(guild.name, id, added, failed)),
        ]);

        if (i < TARGET_SERVERS.length - 1) await sleep(SERVER_DELAY);
    }

    await editMsg(LOG_CHANNEL_ID, progressId, buildProgress(results, total, totalRules));
    await sendMsg(LOG_CHANNEL_ID, buildSummary(results, totalRules));

    const withRules = results.filter(r => !r.skipped && r.added.length > 0);
    console.log(chalk.green(`\n✓ Done. ${totalRules} rules added across ${withRules.length} servers.`));
}

// ── Startup ───────────────────────────────────────────────────────────────────

client.once('ready', async () => {
    console.clear();
    console.log(chalk.bold.blue('Automod Deployer') + chalk.white(' >> ') + chalk.green(client.user.tag));
    console.log(chalk.white(`Guilds in cache : ${client.guilds.cache.size}`));
    console.log(chalk.white(`Target servers  : ${TARGET_SERVERS.length}`));
    console.log('');

    await run();
    process.exit(0);
});

process.on('unhandledRejection', err => {
    console.error(chalk.red(`[ERROR] Unhandled rejection: ${err.message}`));
});

client.login(TOKEN).catch(err => {
    console.error(chalk.red(`[ERROR] Login failed: ${err.message}`));
    process.exit(1);
});
