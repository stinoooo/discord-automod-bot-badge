require('dotenv').config();

const { REST }   = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const RULE_DELAY   = parseInt(process.env.RULE_DELAY ?? '1500', 10);
const CV2_FLAGS    = 32768;
const rest         = new REST({ version: '9' }).setToken(process.env.BOT_TOKEN);

const txt = content                       => ({ type: 10, content });
const sep = (divider = true, spacing = 1) => ({ type: 14, divider, spacing });
const box = (accent, ...components)       => ({ type: 17, accent_color: accent, components });

async function cv2Reply(message, components) {
    return rest.post(Routes.channelMessages(message.channelId), {
        body: {
            flags: CV2_FLAGS,
            components,
            message_reference: { message_id: message.id, channel_id: message.channelId, guild_id: message.guildId },
        },
    });
}

async function cv2Edit(channelId, messageId, components) {
    return rest.patch(Routes.channelMessage(channelId, messageId), {
        body: { components },
    }).catch(() => {});
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const RULES = [
    { name: 'Block Harmful Content',   eventType: 1, triggerType: 4, triggerMetadata: { presets: [1, 2, 3] } },
    { name: 'Block Scam Messages',     eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['free nitro', 'discord nitro free', 'steam gift', 'claim your prize'] } },
    { name: 'Block Invite Links',      eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['discord.gg/*', 'dsc.gg/*', 'discord.com/invite/*'] } },
    { name: 'Block Adult Content',     eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['porn', 'pornhub', 'onlyfans', 'nude pics'] } },
    { name: 'Block Harmful Language',  eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['kys', 'kill yourself', 'neck yourself'] } },
    { name: 'Block Raids & Doxxing',   eventType: 1, triggerType: 1, triggerMetadata: { keywordFilter: ['raid this server', 'join the raid', 'doxxed', 'found your ip'] } },
];

const BLOCK_ACTION = [{ type: 1, metadata: { customMessage: 'This message has been blocked by AutoMod.' } }];

function buildProgress(done, total, results) {
    const lines = results.map(r =>
        r.ok ? `✅  ${r.name}` : `❌  ${r.name} — \`${r.reason}\``
    );
    const filled = Math.round((16 * done) / total);
    const bar    = `\`[${'█'.repeat(filled)}${'░'.repeat(16 - filled)}]\` **${done}/${total}**`;

    return [box(0x5865F2,
        txt(`## 🛡️ Setting Up AutoMod\n${bar}`),
        sep(),
        txt(lines.length ? lines.join('\n') : '*Working…*'),
    )];
}

function buildDone(added, failed) {
    const ok    = added.length > 0;
    const color = failed.length === 0 ? 0x57F287 : ok ? 0xFEE75C : 0xED4245;

    const addedText  = added.length  ? added.map(r => `• ${r}`).join('\n')                                 : '*None*';
    const failedText = failed.length ? failed.map(r => `• ${r.name} — \`${r.reason}\``).join('\n') : null;

    return [box(color,
        txt(`${ok ? '✅' : '❌'} **AutoMod Setup ${ok ? 'Complete' : 'Failed'}**`),
        sep(),
        txt(`**${added.length} rule${added.length !== 1 ? 's' : ''} created:**\n${addedText}` +
            (failedText ? `\n\n**${failed.length} failed:**\n${failedText}` : '')),
        sep(),
        txt(ok
            ? `-# This server now has active AutoMod protection.`
            : `-# No rules were created — check bot permissions.`),
    )];
}

module.exports = {
    name: 'automod',
    aliases: [],
    category: 'general',
    description: 'Deploy AutoMod rules to this server',
    usage: 'automod',
    examples: [],

    run: async (client, message) => {
        const guild   = message.guild;
        const added   = [];
        const failed  = [];
        const results = [];

        const progressMsg = await cv2Reply(message, buildProgress(0, RULES.length, []));
        const progId      = progressMsg.id;

        for (let i = 0; i < RULES.length; i++) {
            const rule = RULES[i];
            try {
                await guild.autoModerationRules.create({
                    name:            rule.name,
                    enabled:         true,
                    eventType:       rule.eventType,
                    triggerType:     rule.triggerType,
                    triggerMetadata: rule.triggerMetadata,
                    actions:         BLOCK_ACTION,
                });
                added.push(rule.name);
                results.push({ ok: true, name: rule.name });
            } catch (err) {
                failed.push({ name: rule.name, reason: err.message });
                results.push({ ok: false, name: rule.name, reason: err.message });
            }

            await cv2Edit(message.channelId, progId, buildProgress(i + 1, RULES.length, results));
            if (i < RULES.length - 1) await sleep(RULE_DELAY);
        }

        await cv2Edit(message.channelId, progId, buildDone(added, failed));
    },
};
