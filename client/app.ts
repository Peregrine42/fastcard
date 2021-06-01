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

const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))
}

initApp().catch(e => error(e))