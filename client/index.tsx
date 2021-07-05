import update, { Spec } from "immutability-helper"
import React, { Component } from "react"
import { render } from "react-dom"
import { Animator } from "./animation/Animator"
import { DragAndDropEventHandlersState } from "./drag-and-drop/DragAndDropEventHandlersState"
import { dragAndDropInitState } from "./drag-and-drop/dragAndDropInitState"
import { continueDragEventHandlers } from "./drag-and-drop/continueDragEventHandlers"
import { Point } from "./entities/Point"
import { Shape } from "./entities/Shape"
import { NudgedMatrix } from "./nudged-pan-zoom-rotate/NudgedMatrix"
import { NudgedPanZoomRotate } from "./nudged-pan-zoom-rotate/NudgedPanZoomRotate"
import { panZoomRotate } from "./nudged-pan-zoom-rotate/panZoomRotateEventHandlers"
import { Server } from "./server/Server"
import { Svg } from "./svg/Svg"
import { endDragEventHandlers } from "./drag-and-drop/endDragEventHandlers"

interface AppState extends DragAndDropEventHandlersState {
    points: Point[]
    shapes: Shape[]
    transform: NudgedMatrix
    panning: boolean
    error: boolean
}

class App extends Component<{ panning: boolean }> {
    server: Server
    svg: Svg
    animator: Animator
    nudgedPZR: NudgedPanZoomRotate
    state: AppState

    constructor(props: { panning: boolean }) {
        super(props)

        this.server = new Server()
        this.animator = new Animator()
        this.nudgedPZR = new NudgedPanZoomRotate(this.animator)
        this.nudgedPZR.setTransformCallback(this.onTransformChange.bind(this))
        this.svg = new Svg(this.nudgedPZR)

        this.state = {
            points: [],
            shapes: [],
            panning: props.panning,
            error: true,
            ...this.nudgedPZR.initState(),
            ...dragAndDropInitState()
        }
    }

    async componentDidMount() {
        this.setState({
            ...(await this.server.reload())
        })
    }

    setPoints({ points }: { points: Point[] }) {
        this.setState({ points })
    }

    onDragStart({
        id,
        offset
    }: {
        id: number,
        offset: [number, number]
    }) {
        this.setState({
            draggingId: id,
            offset,
            isDown: true
        })
    }

    async onDragEnd() {
        const draggingId = this.state.draggingId

        this.setState({
            draggingId: null,
            isDown: false
        })

        const point = this.state.points.find(point => draggingId === point.id)

        if (point) {
            try {
                await this.server.sendUpdate([
                    {
                        id: point.id,
                        x: point.x,
                        y: point.y
                    }
                ])
                return
            } catch (e) {
                console.error(e)
                this.showErrorState()
                return
            }
        }
    }

    showErrorState() {
        this.setState({
            error: true
        })
    }

    onTransformChange() {
        this.setState({
            transform: this.nudgedPZR.getMatrix()
        })
    }

    async onDragContinue(
        { x, y }: { x: number, y: number }
    ): Promise<void> {
        if (this.state.isDown && this.state.draggingId && this.state.points && this.state.offset) {
            const pointIndex = this.state.points.findIndex(point => {
                return point.id === this.state.draggingId
            })
            const point = this.state.points[pointIndex]

            const command: Spec<Point[]> = {}

            command[pointIndex] = {
                x: {
                    $set: x
                },
                y: {
                    $set: y
                },
            }
            const movedPoints = update(this.state.points, command)

            const zChanges: Spec<Point[]> = {}
            if (point.type === "point") {
                movedPoints.forEach((p) => {
                    if (p.id === point.id) {
                        if (p.z !== movedPoints.length - 1) {
                            zChanges[p.id] = {
                                z: {
                                    $set: movedPoints.length - 1
                                }
                            }
                        }
                    } else if (p.z <= point.z) {
                        return
                    } else if (p.z > point.z) {
                        zChanges[p.id] = {
                            z: {
                                $set: p.z - 1
                            }
                        }
                    }
                })

            }
            const zPoints = update(movedPoints, zChanges)
            this.setPoints({
                points: zPoints
            })

            const updates = Object.keys(zChanges).map((index) => {
                const card = zPoints[parseInt(index)]
                return {
                    id: card.id,
                    details: {
                        z: card.z
                    }
                }
            })

            if (updates.length > 0) {
                await this.server.sendUpdate(updates)
            }
        }
    }

    getOffset() {
        return this.state.offset || [0, 0]
    }

    render() {
        let mouseAndTouch
        if (this.state.panning) {
            mouseAndTouch = panZoomRotate(this.nudgedPZR)
        } else {
            mouseAndTouch = {
                ...continueDragEventHandlers(
                    this.getOffset.bind(this),
                    this.onDragContinue.bind(this),
                ),
                ...endDragEventHandlers(
                    this.onDragEnd.bind(this)
                )
            }
        }

        const { points, shapes } = this.svg.svgify(
            this.state,
            this.onDragStart.bind(this)
        )

        const { a, b, c, d, e, f } = this.state.transform
        return (
            <svg
                {...mouseAndTouch}
                style={{ width: "100%", height: "100%" }}
            >
                <g transform={
                    `
                        translate(${innerWidth / 2}, ${innerHeight / 2}) 
                        matrix(${a},${b},${c},${d},${e},${f})
                    `
                }>
                    {shapes}
                    {points}
                </g>
            </svg>
        )
    }
}

const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))

    render(
        <App panning={true} />,
        document.getElementById("view") as HTMLElement
    )
}

initApp()