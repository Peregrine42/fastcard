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
    id: number
    x: number
    y: number
    details: {
        name?: string
        rotation?: number
        facing?: number
    }
}

const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))

    const response = await axios.get("/current-user/cards")
    const el = document.getElementById("card-list") as HTMLElement
    el.innerHTML = ""
    response.data.cards.forEach((c: ServerCard) => {
        if (c.details.name) {
            el.innerHTML += `
                ${c.details.name} 
                ${c.x} 
                ${c.y} 
                ${c.details.rotation} 
                ${c.details.facing}
                <br/>
            `
        }
    })

    const button = document.getElementById("test-trigger") as HTMLElement
    button.addEventListener("click", async () => {
        const xs = [0, 1, 2, 3]
        const ys = [3, 2, 1, 0]
        const rotations = [0, 90, 180, 270]
        const facings = [true, false, true, false]
        await axios.post("/current-user/cards", {
            cardUpdates: response.data.cards.map((c: ServerCard, i: number) => {
                return {
                    id: c.id,
                    x: xs[i],
                    y: ys[i],
                    details: {
                        rotation: rotations[i],
                        facing: facings[i],
                    }
                }
            })
        })

        const update = await axios.get("/current-user/cards")
        const el = document.getElementById("card-list") as HTMLElement
        el.innerHTML = ""
        update.data.cards.forEach((c: ServerCard) => {
            if (c.details.name) {
                el.innerHTML += `
                    ${c.details.name} 
                    ${c.x} 
                    ${c.y} 
                    ${c.details.rotation} 
                    ${c.details.facing}
                    <br/>
                `
            }
        })
    })
}

initApp().catch(e => error(e))