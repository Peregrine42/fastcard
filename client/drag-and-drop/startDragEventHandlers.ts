import React from "react"
import { Point } from "../entities/Point"

export function startDragEventHandlers(
    transform: (([x, y]: [number, number]) => [number, number]),
    point: Point,
    onDragStart: ({ id, offset }: { id: number, offset: [number, number] }) => void
): {
    onMouseDown: (e: React.MouseEvent) => void
} {
    return {
        onMouseDown: (e: React.MouseEvent) => {
            const [x, y] = transform(
                [point.x, point.y]
            )

            onDragStart({
                offset: [
                    x - (e.clientX),
                    y - (e.clientY)
                ],
                id: point.id
            })
        }
    }
}