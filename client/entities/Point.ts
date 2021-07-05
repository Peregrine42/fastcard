import { ServerEntity } from "../server/ServerEntity";
import { Entity } from "./Entity";

export class Point extends Entity {
    constructor(ent: ServerEntity) {
        super(ent)
    }
}