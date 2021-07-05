import React from "react"

export function endDragEventHandlers(
    onDragEnd: () => Promise<void>,
): {
    onMouseUp: (e: React.MouseEvent) => Promise<void>
} {
    return {
        onMouseUp: async (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()

            if (onDragEnd) await onDragEnd()
        },
    }
}
