import dotenv from 'dotenv';
import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import cron from 'node-cron';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import tzLookup from "tz-lookup";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cities = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../public/cities.json'), 'utf8')
);

dotenv.config();

const bot = new Bot(process.env.BOT_API_KEY)
const webAppUrl = process.env.WEB_APP_URL;
const backendUrl = process.env.BACKEND_URL;

function getTimezoneByCity(cityName) {
    const city = cities.find(
        (c) => c.name.toLowerCase() === cityName.toLowerCase()
    );

    if (!city) {
        console.warn(`⚠️ Город "${cityName}" не найден в cities.json`);
        return null;
    }

    const lat = Number(city.coords.lat);
    const lon = Number(city.coords.lon);

    if (isNaN(lat) || isNaN(lon)) {
        console.warn(`⚠️ У города "${cityName}" некорректные координаты`);
        return null;
    }

    try {
        return tzLookup(lat, lon);
    } catch (e) {
        console.error(`⚠️ Не удалось определить часовой пояс для ${cityName}`, e);
        return null;
    }
}

let scheduledTasks = [];

async function scheduleDrugReminders(bot) {
    try {
        for (const task of scheduledTasks) {
            task.stop();
            task.destroy();
        }
        scheduledTasks = [];

        const [humanRes, petRes] = await Promise.all([
            axios.get(`${backendUrl}/public/drugs`),
            axios.get(`${backendUrl}/public/pet/drugs`)
        ]);

        const humanReminders = humanRes.data.map(r => ({ ...r, isPet: false }));
        const petReminders = petRes.data.map(r => ({ ...r, isPet: true }));
        const allReminders = [...humanReminders, ...petReminders];

        for (const reminder of allReminders) {
            const { telegram_id, name, catigories, intake, notification, day, time_day, isPet, city } = reminder;
            if (!telegram_id || !Array.isArray(notification)) continue;

            for (const timeObj of notification) {
                if (!timeObj?.value) continue;

                const [hour, minute] = timeObj.value.split(":").map(Number);
                const timezone = getTimezoneByCity(city);
                if (!timezone || isNaN(hour) || isNaN(minute)) continue;

                const task = cron.schedule(`${minute} ${hour} * * *`, async () => {
                    try {
                        await bot.api.sendMessage(
                            telegram_id,
                            `💊 <b>Напоминание о приёме лекарства для ${isPet ? "питомца" : "человека"}:</b>\n\n` +
                            `<b>Категория:</b> ${catigories}\n` +
                            `<b>Название:</b> ${name}\n` +
                            `<b>Курс:</b> ${day} дней, ${time_day} раза в день\n` +
                            `<b>Способ приёма:</b> ${intake}\n`,
                            { parse_mode: 'HTML' }
                        );
                    } catch (err) {
                        console.error(`Ошибка при отправке напоминания ${telegram_id} в ${timeObj.value}:`, err);
                    }
                }, { timezone });

                scheduledTasks.push(task);
            }
        }

        console.log(`✅ Перепланировано ${scheduledTasks.length} задач(и)`);

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
setTimeout(() => scheduleDrugReminders(bot), 2000);
cron.schedule("*/30 * * * *", async () => {
    console.log("🔄 Обновляем расписание лекарств...");
    await scheduleDrugReminders(bot);
});