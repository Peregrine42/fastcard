import { DragAndDropEventHandlersState } from "./DragAndDropEventHandlersState";

export function dragAndDropInitState(): DragAndDropEventHandlersState {
    return {
        offset: [0, 0],
        draggingId: null,
        isDown: false
    }
}
