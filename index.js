import dotenv from 'dotenv';
import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import cron from 'node-cron';


dotenv.config();

const bot = new Bot(process.env.BOT_API_KEY)
const webAppUrl = process.env.WEB_APP_URL;
const userIds = new Set();

bot.command("start", async (ctx) => {
    const userId = ctx.from.id;
    userIds.add(userId);

    const inlineKeyboard = new InlineKeyboard().webApp("Telegram Web App", webAppUrl)
    await ctx.reply("Добро пожаловать!", {reply_markup: inlineKeyboard})
})


bot.api.setChatMenuButton({
    menu_button: {
        type: "web_app",
        text: "Open Dev App",
        web_app: { url: webAppUrl }
    }
}).catch(console.error);

cron.schedule('* * * * *', async () => {
    for (const userId of userIds) {
        try {
            await bot.api.sendMessage(userId, '🔔 <b>Напоминание</b>\n\nНе забудьте сегодня отметить в приложении, обошлись ли вы без вредной привычки. Это важно для отслеживания вашего прогресса 💪', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: 'Перейти в Web App',
                            web_app: { url: `${webAppUrl}/habits` },
                        }
                    ]]
                }
            });
        } catch (err) {
            console.error(`Не удалось отправить сообщение пользователю ${userId}:`, err);
        }
    }
})


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