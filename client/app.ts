import axios from "axios"
import { serializeError } from "serialize-error"

const log = async (...args: any[]) => {
    console.log(...args)
    await axios.post("/log", {
        message: args.map(a => serializeError(a, { maxDepth: 50 }))
    })
}

const error = async (...args: any[]) => {
    console.error(...args)
    await axios.post("/log", {
        message: args.map(a => serializeError(a, { maxDepth: 50 }))
    })
}

interface ServerCard {
    x: number
    y: number
    details: {
        name?: string
    }
}


const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))

    const response = await axios.get("/current-user/cards")
    const el = document.getElementById("card-list") as HTMLElement
    el.innerHTML = ""
    response.data.cards.forEach((c: ServerCard) => {
        if (c.details.name) {
            el.innerHTML += c.details.name + "<br/>"
        }
    })

}

initApp().catch(e => error(e))