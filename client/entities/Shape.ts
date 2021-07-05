import { ServerEntity } from "../server/ServerEntity";
import { Entity } from "./Entity";

export class Shape extends Entity {
    constructor(ent: ServerEntity) {
        super(ent)
    }
}