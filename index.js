require('dotenv').config();
const {Bot, GrammyError, HttpError, InlineKeyboard} = require("grammy")

const bot = new Bot(process.env.BOT_API_KEY)
const webAppUrl = process.env.WEB_APP_URL;


bot.command("start", async (ctx) => {
    const inlineKeyboard = new InlineKeyboard().webApp("Telegram Web App", webAppUrl)
    await ctx.reply("Добро пожаловать!", {reply_markup: inlineKeyboard})
})

bot.api.setChatMenuButton({
    menu_button: {
        type: "web_app",
        text: "Открыть приложение",
        web_app: { url: webAppUrl }
    }
}).catch(console.error);


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
