require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("❌ Заполни DISCORD_TOKEN, CLIENT_ID и GUILD_ID в .env");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const DATA_FILE = "./warnings.json";
let massWarnRunning = false;
let data = {
    warnings: {},
    logChannels: {}
};

if (fs.existsSync(DATA_FILE)) {
    try {
        data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
        console.log("⚠️ warnings.json повреждён. Создаю новую базу.");
    }
}

function saveData() {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function getWarnings(guildId, userId) {
    if (!data.warnings[guildId]) {
        data.warnings[guildId] = {};
    }

    if (!data.warnings[guildId][userId]) {
        data.warnings[guildId][userId] = [];
    }

    return data.warnings[guildId][userId];
}

const commands = [

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Выдать предупреждение пользователю")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Пользователь")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Причина предупреждения")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Посмотреть предупреждения пользователя")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Пользователь")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    new SlashCommandBuilder()
        .setName("delwarn")
        .setDescription("Удалить предупреждение")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Пользователь")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("number")
                .setDescription("Номер предупреждения")
                .setRequired(true)
                .setMinValue(1)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    new SlashCommandBuilder()
        .setName("clearwarnings")
        .setDescription("Удалить все предупреждения пользователя")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Пользователь")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    new SlashCommandBuilder()
        .setName("setlog")
        .setDescription("Установить канал для логов")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Канал логов")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),
new SlashCommandBuilder()
    .setName("masswarn")
    .setDescription("Выдать несколько предупреждений отдельными сообщениями")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("Пользователь")
            .setRequired(true)
    )
    .addIntegerOption(option =>
        option
            .setName("amount")
            .setDescription("Количество предупреждений")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(300)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Причина")
            .setRequired(true)
    )
    .setDefaultMemberPermissions(
        PermissionFlagsBits.ModerateMembers
    ),
    new SlashCommandBuilder()
    .setName("stopwarn")
    .setDescription("Остановить текущую выдачу массовых предупреждений")
    .setDefaultMemberPermissions(
        PermissionFlagsBits.ModerateMembers
    ),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log("🔄 Регистрирую slash-команды...");

        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("✅ Slash-команды зарегистрированы.");
    } catch (error) {
        console.error("❌ Ошибка регистрации команд:", error);
    }
}

async function sendLog(guild, embed) {

    const channelId = data.logChannels[guild.id];

    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);

    if (!channel) return;

    try {
        await channel.send({
            embeds: [embed]
        });
    } catch (error) {
        console.error("❌ Не удалось отправить лог:", error.message);
    }
}

client.once("clientReady", async () => {

    console.log("================================");
    console.log("🤖 AutoWarn запущен");
    console.log(`👤 Бот: ${client.user.tag}`);
    console.log(`🌐 Серверов: ${client.guilds.cache.size}`);
    console.log("================================");

    await registerCommands();
});

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (!interaction.guild) {
        return interaction.reply({
            content: "❌ Эта команда работает только на сервере.",
            ephemeral: true
        });
    }
// =========================
// MASSWARN
// =========================

if (commandName === "masswarn") {
if (massWarnRunning) {
    return interaction.reply({
        content: "❌ Сейчас уже выполняется массовая выдача варнов. Сначала используй `/stopwarn`.",
        ephemeral: true
    });
}


    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const reason = interaction.options.getString("reason");

    if (target.id === interaction.user.id) {
        return interaction.reply({
            content: "❌ Нельзя предупредить самого себя.",
            ephemeral: true
        });
    }

    const member = await interaction.guild.members
        .fetch(target.id)
        .catch(() => null);

    if (!member) {
        return interaction.reply({
            content: "❌ Пользователь не найден на сервере.",
            ephemeral: true
        });
    }

    if (member.id === interaction.guild.ownerId) {
        return interaction.reply({
            content: "❌ Нельзя предупредить владельца сервера.",
            ephemeral: true
        });
    }

    if (
        member.roles.highest.position >=
        interaction.member.roles.highest.position &&
        interaction.guild.ownerId !== interaction.user.id
    ) {
        return interaction.reply({
            content:
                "❌ Ты не можешь модерировать пользователя с такой же или более высокой ролью.",
            ephemeral: true
        });
    }

    const warnings = getWarnings(
        interaction.guild.id,
        target.id
    );
massWarnRunning = true;
    await interaction.reply({
        content:
            `⚠️ Начинаю выдачу **${amount}** предупреждений пользователю ${target}.\n` +
            `📝 Причина: **${reason}**`
    });

    for (let i = 1; i <= amount; i++) {
if (!massWarnRunning) {
    await interaction.channel.send("🛑 Массовая выдача варнов остановлена.");
    massWarnRunning = false;
    return;
}
        warnings.push({
            reason,
            moderator: interaction.user.id,
            timestamp: Date.now()
        });

        saveData();

        const count = warnings.length;

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Предупреждение #${i}/${amount}`)
            .setDescription(
                `Пользователь ${target} получил предупреждение.`
            )
            .addFields(
                {
                    name: "Причина",
                    value: reason
                },
                {
                    name: "Модератор",
                    value: interaction.user.toString()
                },
                {
                    name: "Всего предупреждений",
                    value: String(count)
                }
            )
            .setTimestamp();

        await interaction.channel.send({
            embeds: [embed]
        });

        await sendLog(
            interaction.guild,
            embed
        );

        // Небольшая задержка между сообщениями
        if (i < amount) {
            await new Promise(resolve =>
                setTimeout(resolve, 1000)
            );
        }
    }

 massWarnRunning = false;
    return;
}
    // =========================
// STOPWARN
// =========================

if (commandName === "stopwarn") {

    if (!massWarnRunning) {
        return interaction.reply({
            content: "ℹ️ Сейчас нет активной массовой выдачи варнов.",
            ephemeral: true
        });
    }

    massWarnRunning = false;

    return interaction.reply({
        content: "🛑 Массовая выдача варнов остановлена."
    });
}
    // =========================
    // WARN
    // =========================

    if (commandName === "warn") {

        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "❌ Нельзя предупредить самого себя.",
                ephemeral: true
            });
        }

        const member = await interaction.guild.members
            .fetch(target.id)
            .catch(() => null);

        if (!member) {
            return interaction.reply({
                content: "❌ Пользователь не найден на сервере.",
                ephemeral: true
            });
        }

        if (member.id === interaction.guild.ownerId) {
            return interaction.reply({
                content: "❌ Нельзя предупредить владельца сервера.",
                ephemeral: true
            });
        }

        if (
            member.roles.highest.position >=
            interaction.member.roles.highest.position &&
            interaction.guild.ownerId !== interaction.user.id
        ) {
            return interaction.reply({
                content: "❌ Ты не можешь модерировать пользователя с такой же или более высокой ролью.",
                ephemeral: true
            });
        }

        const warnings = getWarnings(
            interaction.guild.id,
            target.id
        );

        warnings.push({
            reason,
            moderator: interaction.user.id,
            timestamp: Date.now()
        });

        saveData();

        const count = warnings.length;

        const embed = new EmbedBuilder()
            .setTitle("⚠️ Предупреждение")
            .setDescription(
                `Пользователь ${target} получил предупреждение.`
            )
            .addFields(
                {
                    name: "Причина",
                    value: reason
                },
                {
                    name: "Модератор",
                    value: interaction.user.toString()
                },
                {
                    name: "Всего предупреждений",
                    value: String(count)
                }
            )
            .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });

        await sendLog(interaction.guild, embed);

        // =========================
        // АВТО-TIMEOUT
        // =========================

        if (count >= 3 && member.moderatable) {

            try {

                await member.timeout(
                    10 * 60 * 1000,
                    "3 предупреждения"
                );

                const timeoutEmbed = new EmbedBuilder()
                    .setTitle("⏱️ Автоматический Timeout")
                    .setDescription(
                        `${target} получил timeout на 10 минут.`
                    )
                    .addFields({
                        name: "Причина",
                        value: "Достигнуто 3 предупреждения"
                    })
                    .setTimestamp();

                await interaction.channel.send({
                    embeds: [timeoutEmbed]
                });

                await sendLog(
                    interaction.guild,
                    timeoutEmbed
                );

            } catch (error) {

                console.error(
                    "❌ Не удалось выдать timeout:",
                    error.message
                );

            }
        }

        return;
    }

    // =========================
    // WARNINGS
    // =========================

    if (commandName === "warnings") {

        const target = interaction.options.getUser("user");

        const warnings = getWarnings(
            interaction.guild.id,
            target.id
        );

        if (warnings.length === 0) {
            return interaction.reply({
                content: `✅ У ${target} нет предупреждений.`
            });
        }

        const text = warnings
            .map((warning, index) => {

                const date = new Date(
                    warning.timestamp
                ).toLocaleString("ru-RU");

                return [
                    `**#${index + 1}**`,
                    `Причина: ${warning.reason}`,
                    `Модератор: <@${warning.moderator}>`,
                    `Дата: ${date}`
                ].join("\n");

            })
            .join("\n\n");

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Предупреждения — ${target.tag}`)
            .setDescription(text)
            .setTimestamp();

        return interaction.reply({
            embeds: [embed]
        });
    }

    // =========================
    // DELWARN
    // =========================

    if (commandName === "delwarn") {

        const target = interaction.options.getUser("user");
        const number = interaction.options.getInteger("number");

        const warnings = getWarnings(
            interaction.guild.id,
            target.id
        );

        if (number > warnings.length) {
            return interaction.reply({
                content: `❌ У пользователя только ${warnings.length} предупреждений.`,
                ephemeral: true
            });
        }

        const removed = warnings.splice(
            number - 1,
            1
        )[0];

        saveData();

        return interaction.reply({
            content:
                `✅ Предупреждение #${number} пользователя ${target} удалено.\n` +
                `Причина: **${removed.reason}**`
        });
    }

    // =========================
    // CLEAR
    // =========================

    if (commandName === "clearwarnings") {

        const target = interaction.options.getUser("user");

        if (!data.warnings[interaction.guild.id]) {
            data.warnings[interaction.guild.id] = {};
        }

        data.warnings[interaction.guild.id][target.id] = [];

        saveData();

        return interaction.reply({
            content:
                `✅ Все предупреждения пользователя ${target} удалены.`
        });
    }

    // =========================
    // SETLOG
    // =========================

    if (commandName === "setlog") {

        const channel = interaction.options.getChannel("channel");

        data.logChannels[interaction.guild.id] = channel.id;

        saveData();

        return interaction.reply({
            content:
                `✅ Канал логов установлен: ${channel}`
        });
    }

});

client.login(TOKEN);
