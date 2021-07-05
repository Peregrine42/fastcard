import React from "react"

export function continueDragEventHandlers(
    getOffset: () => [number, number],
    onDragContinue: ({ x, y }: { x: number, y: number }) => Promise<void>,
    transform?: ([x, y]: [number, number]) => [number, number]
): {
    onMouseMove: (e: React.MouseEvent) => Promise<void>
} {
    return {
        onMouseMove: async (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()

            if (!onDragContinue) return
            const offset = getOffset()
            const newX = e.clientX + offset[0]
            const newY = e.clientY + offset[1]
            let [x, y] = [newX, newY]

            if (transform) {
                const result = transform([x, y])
                x = result[0]
                y = result[1]
            }

            await onDragContinue({ x, y })
        }
    }
}
