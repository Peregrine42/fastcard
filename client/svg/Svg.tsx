import React from "react"
import { startDragEventHandlers } from "../drag-and-drop/startDragEventHandlers"
import { Point } from "../entities/Point"
import { Shape } from "../entities/Shape"
import { NudgedPanZoomRotate } from "../nudged-pan-zoom-rotate/NudgedPanZoomRotate"

export class Svg {
    pzr: NudgedPanZoomRotate

    constructor(pzr: NudgedPanZoomRotate) {
        this.pzr = pzr
    }

    svgify(
        { points, shapes }: { points: Point[], shapes: Shape[] },
        setDragStartState: ({ offset, id }: { offset: [number, number], id: number }) => void
    ): { points: JSX.Element[], shapes: JSX.Element[] } {
        const svgPoints = points.map(point => {
            return (
                <circle
                    {...startDragEventHandlers(this.pzr.transform.bind(this.pzr), point, setDragStartState)}
                    key={point.id}
                    cx={point.x}
                    cy={point.y}
                    r={50}>
                </circle>
            )
        })

        const svgShapes = shapes.map((shape) => {
            return <rect key={shape.id} />
        })

        return { points: svgPoints, shapes: svgShapes }
    }
}
