import React from "react"
import { NudgedPanZoomRotate } from "./NudgedPanZoomRotate"

export function panZoomRotate(pzr: NudgedPanZoomRotate): {
    onMouseDown: (e: React.MouseEvent) => void,
    onMouseMove: (e: React.MouseEvent) => void,
    onMouseUp: (e: React.MouseEvent) => void,
    onWheel: (e: React.WheelEvent) => void,
} {
    return {
        onMouseDown: (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            pzr.startPan({
                clientX: e.clientX,
                clientY: e.clientY
            })
        },
        onMouseMove: (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            pzr.continuePan({
                clientX: e.clientX,
                clientY: e.clientY
            })
        },
        onMouseUp: (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            pzr.endPan()
        },
        onWheel: (e: React.WheelEvent) => {
            e.stopPropagation()
            pzr.onWheel({
                clientX: e.clientX,
                clientY: e.clientY,
                deltaY: e.deltaY
            })
        }
    }
}
