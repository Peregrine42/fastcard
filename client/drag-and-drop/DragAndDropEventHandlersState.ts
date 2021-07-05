import { Point } from "../entities/Point";

export interface DragAndDropEventHandlersState {
    isDown?: boolean,
    offset?: [number, number],
    draggingId?: number | null,
    points?: Point[]
}
