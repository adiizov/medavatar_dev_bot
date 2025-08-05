import dotenv from 'dotenv';
import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import cron from 'node-cron';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timezones = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../public/timezone.json'), 'utf8')
);

dotenv.config();

const bot = new Bot(process.env.BOT_API_KEY)
const webAppUrl = process.env.WEB_APP_URL;
const backendUrl = process.env.BACKEND_URL;


function convertToIANATimezone(tz) {
    if (tz.startsWith('UTC+')) {
        const offset = tz.replace('UTC+', '');
        return `Etc/GMT-${offset}`;
    }
    if (tz.startsWith('UTC-')) {
        const offset = tz.replace('UTC-', '');
        return `Etc/GMT+${offset}`;
    }
    return tz;
}

function getTimezoneByCity(cityName) {
    const city = timezones.find(c => c.value.toLowerCase() === cityName.toLowerCase());
    return city?.timezone || null;
}

async function scheduleDrugReminders(bot) {
    try {
        // Получаем данные
        const [humanRes, petRes] = await Promise.all([
            axios.get(`${backendUrl}/public/drugs`),
            axios.get(`${backendUrl}/public/pet/drugs`)
        ]);

        const humanReminders = humanRes.data.map(r => ({ ...r, isPet: false }));
        const petReminders = petRes.data.map(r => ({ ...r, isPet: true }));
        const allReminders = [...humanReminders, ...petReminders];

        for (const reminder of allReminders) {
            const { telegram_id, name, catigories, intake, notification, day, time_day, isPet, city  } = reminder;
            if (!telegram_id || !Array.isArray(notification)) continue;

            for (const timeObj of notification) {
                const [hour, minute] = timeObj.value.split(":").map(Number);
                const rawTimezone = getTimezoneByCity(city)
                const timezone = convertToIANATimezone(rawTimezone);

                cron.schedule(`${minute} ${hour} * * *`, async () => {
                    try {
                        await bot.api.sendMessage(telegram_id,
                            `💊 <b>Напоминание о приёме лекарства для ${isPet ? "питомца" : "человека"}:</b>\n\n` +
                            `<b>Категория:</b> ${catigories}\n` +
                            `<b>Название:</b> ${name}\n` +
                            `<b>Курс:</b> ${day} дней, ${time_day} раза в день\n` +
                            `<b>Способ приёма:</b> ${intake}\n`,
                            {
                                parse_mode: 'HTML'
                            });
                    } catch (err) {
                        console.error(`Ошибка при отправке напоминания ${telegram_id} в ${timeObj.value}:`, err);
                    }
                }, {
                    timezone: timezone,
                });

                // console.log(`⏰ Запланировано: ${telegram_id} — ${name} в ${timeObj.value}`);
            }
        }
    } catch (err) {
        console.error("Ошибка при загрузке лекарств или планировании:", err);
    }
}

bot.command("start", async (ctx) => {
    const inlineKeyboard = new InlineKeyboard().webApp("Telegram Web App", webAppUrl)
    await ctx.reply("Добро пожаловать!", {reply_markup: inlineKeyboard})
})

bot.api.setChatMenuButton({
    menu_button: {
        type: "web_app",
        text: "Open App",
        web_app: { url: webAppUrl }
    }
}).catch(console.error);


// 0 12 * * *

cron.schedule('0 12 * * *', async () => {
    try {
        const response = await axios.get(`${backendUrl}/public`);
        const users = response.data;

        for (const user of users) {
            const telegramId = user.telegram_id;

            if (!telegramId) continue;

            await bot.api.sendMessage(telegramId,
                '🔔 <b>Напоминание</b>\n\nНе забудьте сегодня отметить в приложении, обошлись ли вы без вредной привычки. Это важно для отслеживания вашего прогресса 💪', {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Перейти в Web App', web_app: { url: `${webAppUrl}/habits` } }
                        ]]
                    }
                });
            console.log(telegramId,"- пользователь с привычкой");
        }
    } catch (err) {
        console.error("Ошибка при получении списка пользователей или отправке сообщений:", err);
    }
});


bot.catch((err) => {
    const ctx = err.ctx
    console.error(`error while handling update ${ctx.update.update_id}`)
    const e = err.error
    if(e instanceof GrammyError) {
        console.error("error in request", e.description)
    } else if(e instanceof HttpError) {
        console.error("Could not contact Telegram", e)
    } else {
        console.error("unknown error", e)
    }
})

bot.start()
scheduleDrugReminders(bot)