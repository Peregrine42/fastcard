import { ServerEntity } from "../server/ServerEntity"

export class Entity {
    type: string
    id: number
    x: number
    y: number
    z: number

    constructor(ent: ServerEntity) {
        this.type = ent.details.type || "entity"
        this.id = ent.id
        this.x = ent.x
        this.y = ent.y
        this.z = ent.details.z || -1
    }
}