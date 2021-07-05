import axios, { AxiosResponse } from "axios"
import { Point } from "../entities/Point"
import { Shape } from "../entities/Shape"
import { PointXYUpdate } from "./PointXYUpdate"
import { PointZUpdate } from "./PointZUpdate"
import { ServerEntity } from "./ServerEntity"

export class Server {
    csrf: string

    constructor() {
        const csrfEl = document.getElementById("csrf_token") as HTMLElement
        this.csrf = csrfEl.getAttribute("value") || ""
    }

    async reload(): Promise<{ points: Point[], shapes: Shape[] }> {
        return this.parseReload(await axios.get("/current-user/cards"))
    }

    async sendUpdate(updates: PointZUpdate[] | PointXYUpdate[]): Promise<void> {
        await axios.post("/current-user/cards", {
            cardUpdates: updates
        }, {
            headers: {
                "X-CSRF-TOKEN": this.csrf
            }
        })
    }

    parseReload(response: AxiosResponse): { points: Point[], shapes: Shape[] } {
        const points: Point[] = []
        const shapes: Shape[] = []
        response.data.cards.forEach((ent: ServerEntity) => {
            if (!ent.details.type) {
                points.push(new Point(ent))
            }
        })

        return { points, shapes }
    }
}