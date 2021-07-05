import axios, { AxiosResponse } from "axios"
import update, { Spec } from "immutability-helper"
import { io, Socket } from "socket.io-client"
import React, { Component, createRef, RefObject } from "react"
import ReactDOM from "react-dom"

import nudged from "nudged"
import toastr from "toastr"
import { resizeCanvasToDisplaySize } from "./util/resizeCanvasToDisplaySize"

interface ServerCard {
    id: number
    x: number
    y: number
    details: {
        z?: number
        name?: string
        type?: string
    }
}

interface NudgedTransform {
    translateBy: (x: number, y: number) => NudgedTransform
    rotateBy: (value: number, point: number[]) => NudgedTransform
    multiplyBy: (transform: NudgedTransform) => NudgedTransform
    inverse: () => NudgedTransform
    toArray: () => number[]
    transform: (point: number[]) => number[]
    getMatrix: () => { a: number, b: number, c: number, d: number, e: number, f: number }
}

interface NudgedPanZoomRotateTouch {
    identifier: number
    clientX: number
    clientY: number
}

interface NudgedPanZoomRotateTouchDiff {
    dx: number,
    dy: number,
    rx: number,
    ry: number
}

class NudgedPanZoomRotate {
    currentTransform?: NudgedTransform
    beforeDragTransform?: NudgedTransform
    animationStartTransform?: NudgedTransform;
    startPanX = 0
    startPanY = 0
    startTouches: NudgedPanZoomRotateTouch[] = []
    panning = false
    pointers: { [identifier: string]: NudgedPanZoomRotateTouchDiff } = {}
    committedTransform?: NudgedTransform
    animationDurationStep = 150; // in miliseconds
    animationDuration = 0;
    startValue: null | number = null
    endValue: null | number = null
    startTime: null | number = null
    animator: Animator
    animationCallback?: (currentValue: number) => void
    onTransform?: () => void

    constructor(animator: Animator) {
        this.animator = animator
    }

    setTransformCallback(onTransform: () => void) {
        this.onTransform = onTransform
    }

    init() {
        this.currentTransform = nudged.Transform.IDENTITY
        this.beforeDragTransform = nudged.Transform.IDENTITY
        this.sync(true)
    }

    setTransform(transformArray: number[] | null) {
        if (!transformArray) this.currentTransform = nudged.Transform.IDENTITY
        else {
            this.currentTransform = nudged.createFromArray(transformArray)
        }
        if (this.onTransform) this.onTransform()
        this.sync(true)
    }

    onAnimationFrame(callback: () => void) {
        this.animationCallback = callback;
    }

    animateRotation(ani: Animation, currentValue: number) {
        const startState = (ani.startState as { transform: NudgedTransform })
        this.currentTransform = startState.transform.rotateBy(
            currentValue * Math.PI / 180, [0, 0]
        )

        this.sync(true)

        if (this.animationCallback) {
            this.animationCallback(currentValue)
        }
    }

    sync(isDone = false) {
        if (!this.currentTransform) return
        if (isDone) this.committedTransform = nudged.createFromArray(this.currentTransform.toArray())
    }

    startPan(e: {
        clientX: number,
        clientY: number
    }) {
        this.startPanX = e.clientX
        this.startPanY = e.clientY
        if (this.currentTransform) {
            this.beforeDragTransform = nudged.createFromArray(
                this.currentTransform.toArray()
            )
        }
        this.panning = true
    }

    continuePan(e: {
        clientX: number,
        clientY: number
    }) {
        if (this.beforeDragTransform) {
            this.currentTransform = this.beforeDragTransform.translateBy(
                e.clientX - this.startPanX,
                e.clientY - this.startPanY
            )
        }
        this.sync(true)
    }

    endPan() {
        this.panning = false
        this.sync(true)
    }

    onWheel(e: {
        deltaY: number,
        clientX: number,
        clientY: number
    }) {
        const direction = e.deltaY > 0 ? 1.1 : 0.9
        if (this.currentTransform) {
            const [x, y] = this.currentTransform.inverse().transform([e.clientX - (innerWidth / 2), e.clientY - (innerHeight / 2)])
            const newTransform = nudged.Transform.IDENTITY.scaleBy(direction, [x, y])
            this.currentTransform = this.currentTransform.multiplyBy(newTransform)
        }

        this.sync(true)
    }

    async rotate() {
        return new Promise<void>(res => {
            const currentAni = this.animator.animations.find(ani => ani.name === "view-rotate")
            if (currentAni) {
                if (currentAni.endValue === null) {
                    currentAni.endValue = 45
                    currentAni.duration = this.animationDurationStep;
                } else {
                    currentAni.endValue += 45
                    currentAni.duration += this.animationDurationStep;
                }
            } else {
                if (!this.currentTransform) return
                this.animator.start({
                    elapsedTime: 0,
                    duration: this.animationDurationStep,
                    startValue: 0,
                    endValue: 45,
                    name: "view-rotate",
                    startState: {
                        transform: nudged.createFromArray(this.currentTransform.toArray())
                    },
                    callback: (ani: Animation, currentValue: number) => this.animateRotation(ani, currentValue),
                    done: res
                })
            }
        })
    }

    touchDragStart(touches: NudgedPanZoomRotateTouch[]) {
        this.startTouches = touches.map(t => { return { ...t } }).sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        if (this.beforeDragTransform && this.currentTransform) {
            this.beforeDragTransform = nudged.createFromArray(this.currentTransform.toArray())
        }
        this.panning = true
    }

    touchDrag(touches: { identifier: number, clientX: number, clientY: number }[]) {
        const domain = this.startTouches.map(t => [t.clientX, t.clientY])
        touches.sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        const range = touches.map(t => [t.clientX, t.clientY])
        if (this.currentTransform) {
            this.currentTransform = this.currentTransform.multiplyBy(nudged.estimate("TS", domain, range))
        }
        this.startTouches = touches.map(t => { return { ...t } }).sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        this.sync(true)
    }

    startTouch(id: number, x: number, y: number) {
        this.commit()
        this.pointers[id] = { dx: x, dy: y, rx: x, ry: y }
        this.updateTransform()
    }

    async continueTouch(id: number, x: number, y: number) {
        if (this.pointers[id]) {
            this.pointers[id].rx = x
            this.pointers[id].ry = y
            await this.updateTransform()
        }
    }

    async endTouch(id: number) {
        await this.commit()
        delete this.pointers[id]
    }

    async commit() {
        // Move ongoing transformation to the committed transformation so that
        // the total transformation stays the same.

        // Commit ongoingTransformation. As a result
        // the domain and range of all pointers become equal.
        const domain = []
        const range = []
        for (const id in this.pointers) {
            if (this.pointers[id]) {
                const p = this.pointers[id]
                domain.push([p.dx, p.dy])
                range.push([p.rx, p.ry]) // copies
                // Move transformation from current pointers;
                // Turn ongoingTransformation to identity.
                p.dx = p.rx
                p.dy = p.ry
            }
        }
        // Calculate the transformation to commit and commit it by
        // combining it with the previous transformations. Total transform
        // then becomes identical with the commited ones.
        const t = nudged.estimateTS(domain, range)
        this.committedTransform = t.multiplyBy(this.committedTransform)
        this.sync(true)
    }

    async updateTransform() {
        // Calculate the total transformation from the committed transformation
        // and the points of the ongoing transformation.

        let id: string
        const domain = []
        const range = []
        for (id in this.pointers) {
            if (this.pointers[id]) {
                const p = this.pointers[id]
                domain.push([p.dx, p.dy])
                range.push([p.rx, p.ry])
            }
        }
        // Calculate ongoing transform and combine it with the committed.
        const t = nudged.estimateTS(domain, range)
        this.currentTransform = t.multiplyBy(this.committedTransform)
        await this.sync()
    }
}

interface NudgedMatrix {
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
}

interface Point {
    id: number
    render: (ctx: CanvasRenderingContext2D) => void
    hitRender?: (ctx: CanvasRenderingContext2D, color: string) => void
    type: string
}

class Canvas {
    dom?: HTMLCanvasElement
    ctx?: CanvasRenderingContext2D

    setDOM(dom: HTMLCanvasElement) {
        this.dom = dom
    }

    render({ a, b, c, d, e, f }: NudgedMatrix, points: Point[]) {
        if (!this.dom) return
        resizeCanvasToDisplaySize(this.dom)
        if (!this.ctx) {
            this.ctx = this.dom.getContext("2d") || undefined
        }

        if (!this.ctx) {
            throw new Error("Could not find or create context")
        }

        this.ctx.clearRect(0, 0, this.dom.width, this.dom.height)
        this.ctx.save()

        this.ctx.translate(innerWidth / 2, innerHeight / 2)

        this.ctx.transform(
            a, b, c, d, e, f
        )

        points.forEach(point => {
            if (this.ctx) {
                point.render(this.ctx)
            }
        })

        this.ctx.restore()
    }
}

class HitCanvas {
    dom?: HTMLCanvasElement
    targetDom?: HTMLCanvasElement
    ctx?: CanvasRenderingContext2D
    colorMap: { obj: Point, rgb: string }[] = []

    setObjects(objs: Point[]) {
        this.colorMap = objs.map((o, C) => {
            const rgb = this.getRGB(C)
            return { obj: o, rgb }
        })
    }

    setDOM(value: HTMLCanvasElement) {
        this.dom = value
    }
    setTargetDOM(value: HTMLCanvasElement) {
        this.targetDom = value
    }

    getRGB(i: number) {
        const C = i + 1
        const B = C % 256
        const G = ((C - B) / 256) % 256
        const R = ((C - B) / Math.pow(256, 2)) - G / 256

        return `${R},${G},${B}`
    }

    getObjectAt(x: number, y: number) {
        if (!this.ctx) throw new Error("Could not find canvas context")
        const [R, G, B] = this.ctx.getImageData(x, y, 1, 1).data;
        const color = `${R},${G},${B}`
        const i = this.colorMap.findIndex(({ rgb: c }) => {
            return c === color
        })

        if (i > -1) {
            return this.colorMap[i].obj
        } else {
            return null
        }
    }

    render({ a, b, c, d, e, f }: NudgedMatrix, points: Point[]) {
        if (!this.dom) return
        if (!this.targetDom) return
        resizeCanvasToDisplaySize(
            this.dom,
            this.targetDom.clientWidth,
            this.targetDom.clientHeight
        )
        if (!this.ctx) {
            this.ctx = this.dom.getContext("2d") || undefined
        }

        if (!this.ctx) {
            throw new Error("Could not find or create context")
        }

        this.ctx.clearRect(0, 0, this.dom.width, this.dom.height)
        this.ctx.save()

        this.ctx.translate(innerWidth / 2, innerHeight / 2)

        this.ctx.transform(
            a, b, c, d, e, f
        )

        points.forEach(point => {
            if (point.hitRender) {
                const index = this.colorMap.findIndex(({ obj: o }) => {
                    return o.id === point.id
                })

                if (index > -1) {
                    const color = this.colorMap[index].rgb

                    if (this.ctx) {
                        point.hitRender(this.ctx, color)
                    }
                } else {
                    console.error(point, this.colorMap, "not found in color map")
                }
            }
        })

        this.ctx.restore()
    }
}

interface Animation {
    name: string
    callback?: (ani: Animation, currentValue: number) => void
    done?: () => void
    startValue: number | null
    endValue: number | null
    startTime?: number | null
    duration: number
    elapsedTime?: number
    startState: unknown
}

class Animator {
    animations: Animation[] = []
    running = false

    frame(currentTime: number) {
        this.animations.forEach((ani) => {
            if (ani.endValue === null || ani.startValue === null) throw new Error("Animation start and end are null")
            if (ani.startTime === null || typeof ani.startTime === "undefined") ani.startTime = currentTime
            if ((typeof (ani.elapsedTime) !== "undefined") && (ani.elapsedTime < ani.duration)) {
                ani.elapsedTime = currentTime - ani.startTime
                const currentValue = Math.floor((ani.elapsedTime / ani.duration) * (ani.endValue - ani.startValue))
                if (ani.callback) ani.callback(ani, currentValue)
            } else {
                if (ani.callback) ani.callback(ani, ani.endValue)
                ani.startTime = null;
                ani.startValue = null;
                ani.endValue = null;
                ani.duration = 0;
                if (ani.done) ani.done()
            }
        })

        this.animations = this.animations.filter(ani => ani.startTime !== null)

        if (this.animations.length > 0) {
            window.requestAnimationFrame((time) => this.frame(time));
        }
    }

    start(ani: Animation) {
        this.animations.push(ani)
        if (!this.running) {
            window.requestAnimationFrame((time) => {
                this.frame(time)
            })
        }
    }
}

interface ServerShape {
    id: number
    details: {
        points?: number[],
        z?: number,
        name?: string
    }
}

class Shape {
    id: number
    name: string
    points: Card[] | number[]
    x = 0
    y = 0
    startX = 0
    startY = 0
    animationX = undefined
    animationY = undefined
    z = -1
    type = "shape"

    constructor({ id, details }: ServerShape) {
        this.id = id
        this.z = details.z || 0
        this.points = details.points || []
        this.name = details.name || "Untitled"
    }

    render(ctx: CanvasRenderingContext2D) {
        ctx.save()
        ctx.beginPath()
        for (let i = 0; i < this.points.length; i += 1) {
            if (typeof this.points[i] !== "number") {
                const point = this.points[i] as unknown as Card
                const x = point.getX() - (innerWidth / 2)
                const y = point.getY() - (innerHeight / 2)
                if (i === 0) {
                    ctx.moveTo(x, y)
                } else {
                    ctx.lineTo(x, y)
                }
            }
        }
        const point = this.points[0] as unknown as Card
        const x = point.x - (innerWidth / 2)
        const y = point.y - (innerHeight / 2)
        ctx.lineTo(x, y)
        ctx.lineWidth = 15
        ctx.strokeStyle = "#333"
        ctx.stroke()
        ctx.fillStyle = "orange"
        ctx.fill()
        ctx.restore()
    }
}

class Card {
    id: number
    name: string
    x: number
    y: number
    z: number
    startX?: number
    startY?: number
    animationX?: number
    animationY?: number
    type = "card"

    constructor(c: ServerCard) {
        this.id = c.id
        this.name = c.details.name || "Untitled"
        this.x = c.x
        this.y = c.y
        this.z = c.details.z || 0
    }

    getX() {
        if (
            typeof (this.startX) !== "undefined" &&
            typeof (this.startY) !== "undefined" &&
            typeof (this.animationX) !== "undefined"
        ) {
            return this.animationX
        } else {
            return this.x
        }
    }

    getY() {
        if (
            typeof (this.startX) !== "undefined" &&
            typeof (this.startY) !== "undefined" &&
            typeof (this.animationY) !== "undefined"
        ) {
            return this.animationY
        } else {
            return this.y
        }
    }

    render(ctx: CanvasRenderingContext2D) {
        ctx.save()
        const x = this.getX() - (innerWidth / 2)
        const y = this.getY() - (innerHeight / 2)
        ctx.beginPath()
        ctx.arc(x, y, 50, 0, 2 * Math.PI)
        ctx.fillStyle = "#aaa"
        ctx.fill()
        ctx.lineWidth = 15
        ctx.strokeStyle = "#333"
        ctx.stroke()
        ctx.restore()
    }

    hitRender(ctx: CanvasRenderingContext2D, color: string) {
        ctx.save()
        const x = this.getX() - (innerWidth / 2)
        const y = this.getY() - (innerHeight / 2)
        ctx.beginPath()
        ctx.arc(x, y, 50, 0, 2 * Math.PI)
        ctx.fillStyle = `rgb(${color})`
        ctx.fill()
        ctx.lineWidth = 15
        ctx.strokeStyle = `rgb(${color})`
        ctx.stroke()
        ctx.restore()
    }
}

interface Touch {
    identifier: number
}

interface ServerCardUpdate {
    cardGrabs?: number[]
    cardDrops?: number[]
    cardFlips?: number[]
    cardShuffles?: number[]
    cardUpdates?: {
        id: number
        x?: number
        y?: number
        z?: number
    }[]
}

type CardIndex = { [id: string]: (Card | Shape) }

class Board extends Component {
    userId?: number
    csrf?: string
    socket?: Socket
    draggingCardId: number | null
    offset: [number, number]
    isDown: boolean
    panning: boolean
    angle: number
    fullscreen: boolean
    isInErrorState: boolean
    nudgedPanZoomRotate: NudgedPanZoomRotate
    touches: Touch[] = []
    dom: RefObject<HTMLDivElement>
    canvas: Canvas
    hitCanvas: HitCanvas
    animator: Animator
    state: {
        cards: CardIndex,
        cs: (Card | Shape)[],
        domTransform?: NudgedMatrix,
        shouldPanZoom: boolean
    }
    onPanZoomRotate = throttle(() => {
        if (this.nudgedPanZoomRotate.currentTransform) {
            location.hash = this.stringifyTransform(this.nudgedPanZoomRotate.currentTransform.toArray(), this.state.shouldPanZoom)
        }
    }, 300)

    constructor(props: Record<string, never>) {
        super(props)
        this.draggingCardId = null
        this.offset = [0, 0]
        this.isDown = false
        this.panning = false
        this.angle = 0
        this.fullscreen = false
        this.isInErrorState = false
        this.animator = new Animator()
        this.nudgedPanZoomRotate = new NudgedPanZoomRotate(this.animator)
        this.dom = createRef();
        this.state = {
            cs: [],
            cards: {},
            shouldPanZoom: true
        }
        this.canvas = new Canvas()
        this.hitCanvas = new HitCanvas()
    }

    stringifyTransform(transform?: number[], shouldPanZoom?: boolean) {
        if (transform) {
            if (transform.length !== 4) {
                throw new Error("Transform is the wrong size!")
            }
            const [s, r, tx, ty] = transform
            return `${s},${r},${tx},${ty},${shouldPanZoom ? "pan" : "move"}`
        } else {
            return `${shouldPanZoom ? "pan" : "move"}`
        }
    }

    parseTransform(string?: string) {
        if (string) {
            const parts = string.split(",")
            if (parts.length === 5) {
                const [s, r, tx, ty, panOrMove] = string.split(",")
                return {
                    transform: [
                        parseFloat(s),
                        parseFloat(r),
                        parseFloat(tx),
                        parseFloat(ty),
                    ],
                    panOrMove
                }
            }
        }
        return null
    }

    async componentDidMount() {
        window.addEventListener("resize", throttle(async () => {
            await this.reload()
        }, 1000))

        this.nudgedPanZoomRotate.setTransformCallback(() => {
            this.setState({
                domTransform: Object.assign({}, this.nudgedPanZoomRotate.currentTransform?.getMatrix())
            })
        })

        const success = document.getElementById("success")
        if (success) {
            const message = success.innerHTML
            success.innerHTML = ""
            toastr.success(message, "Success!", {
                positionClass: "toast-bottom-center"
            })
        }

        await this.reload()
    }

    within(val: number, target: number, margin: number) {
        return (
            val > (target - margin) && val < (target + margin)
        )
    }

    async reload() {
        const dom = this.dom?.current
        if (!dom) return
        const child = dom.getElementsByClassName("view-pane")[0] as HTMLCanvasElement
        const hitCanvasChild = dom.getElementsByClassName("view-hit-canvas")[0] as HTMLCanvasElement

        this.canvas.setDOM(child)
        this.hitCanvas.setDOM(hitCanvasChild)
        this.hitCanvas.setTargetDOM(child)

        const { transform: transformArray, panOrMove } = this.parseTransform(window.location.hash.slice(1))

        this.nudgedPanZoomRotate.init()

        if (transformArray) {
            this.nudgedPanZoomRotate.setTransform(transformArray)
        }

        const cardUpdateCallback = ({ cardUpdates: newStates }: ServerCardUpdate) => {
            let command: Spec<CardIndex> = {}
            newStates?.forEach((s) => {
                if (s.id) {
                    const card = this.state.cards[s.id]
                    if (card) {
                        if (
                            typeof (s.x) !== "undefined" &&
                            typeof (s.y) !== "undefined"
                        ) {
                            command = update(command, {
                                [card.id]: {
                                    x: {
                                        $set: s.x + (innerWidth / 2)
                                    },
                                    y: {
                                        $set: s.y + (innerHeight / 2)
                                    }
                                }
                            })

                            const sx = s.x + (innerWidth / 2)
                            const sy = s.y + (innerHeight / 2)

                            if (
                                (!this.within(card.x, sx, 5)) ||
                                (!this.within(card.y, sy, 5))
                            ) {
                                command = update(command, {
                                    [card.id]: {
                                        startX: {
                                            $set: card.x
                                        },
                                        startY: {
                                            $set: card.y
                                        }
                                    }
                                })
                            }
                        }
                        if (typeof (s.z) !== "undefined") {
                            command = update(command, {
                                [card.id]: {
                                    z: {
                                        $set: s.x
                                    }
                                }
                            })
                        }
                    }
                }
            })

            const newCards = update(this.state.cards, command)
            this.setCards(newCards)
        }


        const csrfEl = document.getElementById("csrf_token") as HTMLElement
        this.csrf = csrfEl.getAttribute("value") || ""

        const userIdEl = document.getElementById("user_id") as HTMLElement
        const userId = userIdEl.getAttribute("value") || null

        if (userId === null) {
            throw Error("No user ID!")
        }

        this.userId = parseInt(userId)

        this.socket = io()

        this.socket.on("connect", () => {
            console.log("Connected!")
        })

        this.socket.on("disconnect", () => {
            this.showErrorState()
        })

        this.socket.on("cardUpdate", cardUpdateCallback)

        await this.getInitialCardsFromServer()
    }

    redrawCards(initialCardsResponse?: AxiosResponse<{ cards: ServerCard[] }>) {
        let cards
        if (initialCardsResponse) {
            const initialCards = [...initialCardsResponse.data.cards] as ServerCard[]
            cards = initialCards.map(c => {
                let card
                if (c.details.type === "shape") {
                    card = new Shape(c)
                } else {
                    card = new Card(c)
                }
                return card
            })
        } else {
            cards = Object.values(this.state.cards) as Card[]
        }

        const cs = cards.map(card => {
            if (this.nudgedPanZoomRotate) {
                card.x = card.x + (innerWidth / 2)
                card.y = card.y + (innerHeight / 2)
                return card
            }
        })

        const cardsById: { [key: string]: Card | Shape } = {}
        cs.forEach(c => {
            if (c) { cardsById[c.id] = c }
        })

        this.setCards(cardsById)
    }

    async getInitialCardsFromServer() {
        const initialCardsResponse = await axios.get("/current-user/cards")
        this.redrawCards(initialCardsResponse)
    }

    setCards(newCards: { [key: string]: Card | Shape }) {
        const cs = Object.values(this.state.cards)
        cs.sort((a: (Card | Shape), b: (Card | Shape)) => {
            if (a.z > b.z) {
                return 1
            } else {
                return -1
            }
        })

        cs.forEach(c => {
            if (c?.type === "shape") {
                const shape = c as unknown as Shape
                shape.points.forEach((pointOrId, i) => {
                    if (typeof pointOrId === "number") {
                        shape.points.splice(i, 1, (this.state.cards[pointOrId] as Card))
                    } else {
                        shape.points.splice(i, 1, (this.state.cards[pointOrId.id] as Card))
                    }
                })
            } else if (c?.type === "card") {
                const currentAni = this.animator.animations.find((ani) => ani.name === `card-update-${c.id}`)
                if (!currentAni) {
                    this.animator.start({
                        elapsedTime: 0,
                        name: `card-update-${c.id}`,
                        startState: {},
                        duration: 150,
                        startValue: 0,
                        endValue: 1000,
                        callback: (_ani: Animation, currentValue: number) => {
                            if (typeof (c.startX) !== "undefined" && typeof (c.startY) !== "undefined") {
                                const dx = c.x - c.startX
                                const dy = c.y - c.startY

                                const scaledDx = dx * (currentValue / 1000)
                                const scaledDy = dy * (currentValue / 1000)

                                c.animationX = c.startX + scaledDx
                                c.animationY = c.startY + scaledDy
                            }
                        },
                        done: () => {
                            c.animationX = undefined
                            c.animationY = undefined
                            c.startX = undefined
                            c.startY = undefined
                        }
                    })
                }
            }
        })

        this.hitCanvas.setObjects(cs as Point[])

        this.setState({
            cards: newCards,
            cs
        })
    }

    mouseDown(e: {
        preventDefault: () => void,
        nativeEvent: {
            stopImmediatePropagation: () => void,
        },
        clientX: number,
        clientY: number
    }) {
        if (this.state.shouldPanZoom) {
            this.nudgedPanZoomRotate?.startPan(e)
        } else {
            const obj = this.hitCanvas?.getObjectAt(e.clientX, e.clientY)
            if (obj && obj.type === "card") {
                this.mouseDownFor(obj as Card, {
                    preventDefault: e.preventDefault,
                    stopImmediatePropagation: e.nativeEvent.stopImmediatePropagation,
                    clientX: e.clientX,
                    clientY: e.clientY
                })
            }
        }
    }

    mouseDownFor(
        c: Card,
        e: {
            stopImmediatePropagation: () => void,
            preventDefault: () => void,
            clientX: number,
            clientY: number
        }
    ) {
        if (this.state.shouldPanZoom) return
        e.stopImmediatePropagation()
        this.isDown = true

        if (!this.nudgedPanZoomRotate?.currentTransform) {
            return
        }

        const [x, y] = this.nudgedPanZoomRotate?.currentTransform.transform(
            [c.x, c.y]
        )

        this.offset = [
            x - (e.clientX),
            y - (e.clientY)
        ]
        this.draggingCardId = c.id
    }

    async mouseUp(
        e: {
            preventDefault: () => void,
            nativeEvent: {
                stopImmediatePropagation: () => void,
            },
            clientX: number,
            clientY: number
        },
    ) {
        if (this.state.shouldPanZoom) {
            if (this.nudgedPanZoomRotate?.panning) {
                this.nudgedPanZoomRotate?.endPan()
            }
        }
        e.nativeEvent.stopImmediatePropagation()
        if (!this.isDown) return
        this.isDown = false

        if (this.draggingCardId) {
            const card = this.state.cards[this.draggingCardId]

            if (card && this.nudgedPanZoomRotate) {
                try {
                    await axios.post("/current-user/cards", {
                        cardUpdates: [
                            {
                                id: this.draggingCardId,
                                x: card.x - (innerWidth / 2),
                                y: card.y - (innerHeight / 2)
                            }
                        ]
                    }, {
                        headers: {
                            "X-CSRF-TOKEN": this.csrf
                        }
                    })
                } catch (e) {
                    console.error(e)
                    this.showErrorState()
                }
            }
            this.draggingCardId = null
        }
    }

    showErrorState() {
        this.isInErrorState = true
        toastr.error(`
            Server disconnected. 
            Please 
            <button id="error-button"> 
                reload the page
            </button> to continue.
        `, "Disconnect", {
            timeOut: 0,
            hideDuration: 0,
            extendedTimeOut: 0,
            positionClass: "toast-bottom-center",
            tapToDismiss: false,
            preventDuplicates: true,
            onShown: () => {
                const el = document.getElementById("error-button")
                if (el) {
                    el.addEventListener("click", async () => {
                        await axios.get("/status")
                        location.reload()
                    })
                }
            }
        })
    }

    async mouseMove(
        e: {
            preventDefault: () => void,
            nativeEvent: {
                stopImmediatePropagation: () => void,
            },
            clientX: number,
            clientY: number
        },
        pan = true
    ) {
        if (this.state.shouldPanZoom) {
            if (this.nudgedPanZoomRotate?.panning && pan) {
                this.nudgedPanZoomRotate?.continuePan(e)
                return
            }
        }
        e.nativeEvent.stopImmediatePropagation()
        e.preventDefault();
        if (this.isDown && this.draggingCardId) {
            const card = this.state.cards[this.draggingCardId]
            const command: Spec<CardIndex> = {}
            const newX = e.clientX + this.offset[0]
            const newY = e.clientY + this.offset[1]

            if (this.nudgedPanZoomRotate) {
                if (this.nudgedPanZoomRotate.currentTransform) {
                    const [x, y] = this.nudgedPanZoomRotate.currentTransform.inverse().transform([newX, newY])

                    command[card.id] = {
                        x: {
                            $set: x
                        },
                        y: {
                            $set: y
                        },
                    }
                }
            }
            const movedCards = update(this.state.cards, command)

            const zChanges: Spec<CardIndex> = {}
            const cardList = Object.values(movedCards)
            if (card.type === "card") {
                cardList.forEach((c) => {
                    if (c.id === card.id) {
                        if (c.z !== cardList.length - 1) {
                            zChanges[c.id] = {
                                z: {
                                    $set: cardList.length - 1
                                }
                            }
                        }
                    } else if (c.z <= card.z) {
                        return
                    } else if (c.z > card.z) {
                        zChanges[c.id] = {
                            z: {
                                $set: c.z - 1
                            }
                        }
                    }
                })

            }
            const zCards = update(movedCards, zChanges)
            this.setCards(zCards)

            const updates = Object.keys(zChanges).map((index) => {
                const card = zCards[index]
                return {
                    id: card.id,
                    details: {
                        z: card.z
                    }
                }
            })

            if (updates.length > 0) {
                await axios.post("/current-user/cards", {
                    cardUpdates: updates
                }, {
                    headers: {
                        "X-CSRF-TOKEN": this.csrf
                    }
                })
            }
        }
    }

    async onWheel(e: React.WheelEvent) {
        if (this.state.shouldPanZoom) {
            this.nudgedPanZoomRotate?.onWheel(e)
        }
    }

    updateCanvases() {
        if (this.nudgedPanZoomRotate?.currentTransform) {
            console.log("hi")
            this.canvas?.render(
                this.nudgedPanZoomRotate.currentTransform.getMatrix(),
                this.state.cs as Point[]
            )
            this.hitCanvas?.render(
                this.nudgedPanZoomRotate.currentTransform.getMatrix(),
                this.state.cs as Point[]
            )
        }
    }

    render() {
        this.updateCanvases()
        return (
            <div ref={this.dom}>
                <div id="view-inner">
                    <canvas
                        id="view-hit-canvas"
                        className="view-hit-canvas"
                        style={{
                            display: "none"
                        }}
                    ></canvas>
                    <canvas
                        id="view-pane"
                        className="view-pane"
                        onWheel={this.onWheel.bind(this)}
                        onMouseMove={this.mouseMove.bind(this)}
                        onMouseUp={this.mouseUp.bind(this)}
                        onMouseDown={(e: React.MouseEvent) => {
                            this.mouseDown({
                                clientX: e.clientX || 0,
                                clientY: e.clientY || 0,
                                nativeEvent: {
                                    stopImmediatePropagation: e.nativeEvent.stopImmediatePropagation.bind(e),
                                },

                                preventDefault: e.preventDefault.bind(e)
                            })
                        }}
                        onTouchStart={(e: React.TouchEvent) => {
                            e.preventDefault()
                            if (this.state.shouldPanZoom) {
                                Array.from(e.changedTouches).forEach(t => {
                                    if (!this.touches.map(to => to.identifier).includes(t.identifier)) {
                                        this.nudgedPanZoomRotate?.startTouch(
                                            t.identifier,
                                            t.clientX - (innerWidth / 2),
                                            t.clientY - (innerHeight / 2),
                                        )
                                        this.touches.push({ identifier: t.identifier })
                                    }
                                })
                            } else {
                                this.mouseDown({
                                    clientX: e.touches[0]?.clientX || 0,
                                    clientY: e.touches[0]?.clientY || 0,
                                    nativeEvent: {
                                        stopImmediatePropagation: e.nativeEvent.stopImmediatePropagation.bind(e),

                                    },
                                    preventDefault: e.preventDefault.bind(e),
                                })
                            }
                        }}
                        onTouchMove={async (e: React.TouchEvent) => {
                            e.preventDefault()
                            if (this.state.shouldPanZoom) {
                                for (let i = 0; i < e.changedTouches.length; i += 1) {
                                    const t = e.changedTouches[i]
                                    if (!this.touches.map(to => to.identifier).includes(t.identifier)) {
                                        this.nudgedPanZoomRotate?.startTouch(
                                            t.identifier,
                                            t.clientX - (innerWidth / 2),
                                            t.clientY - (innerHeight / 2),
                                        )
                                        this.touches.push({ identifier: t.identifier })
                                    } else {
                                        await this.nudgedPanZoomRotate?.continueTouch(
                                            t.identifier,
                                            t.clientX - (innerWidth / 2),
                                            t.clientY - (innerHeight / 2),
                                        )
                                    }
                                }
                            } else {
                                this.mouseMove({
                                    clientX: e.touches[0]?.clientX || 0,
                                    clientY: e.touches[0]?.clientY || 0,
                                    nativeEvent: {
                                        stopImmediatePropagation: e.nativeEvent.stopImmediatePropagation.bind(e)
                                    },
                                    preventDefault: e.preventDefault.bind(e)
                                }, false)
                            }
                        }}
                        onTouchEnd={async (e: React.TouchEvent) => {
                            e.preventDefault()
                            if (this.state.shouldPanZoom) {
                                for (let i = 0; i < e.changedTouches.length; i += 1) {
                                    const t = e.changedTouches[i]
                                    if (i > -1) {
                                        await this.nudgedPanZoomRotate?.endTouch(
                                            t.identifier
                                        )
                                        this.touches.splice(i, 1)
                                    }
                                }
                            } else {
                                this.mouseUp({
                                    clientX: e.touches[0]?.clientX || 0,
                                    clientY: e.touches[0]?.clientY || 0,
                                    nativeEvent: {
                                        stopImmediatePropagation: e.nativeEvent.stopImmediatePropagation.bind(e)
                                    },
                                    preventDefault: e.preventDefault.bind(e)
                                })
                            }
                        }}
                    >
                    </canvas>
                </div>
                <button
                    disabled={this.isInErrorState}
                    className="button"
                    onClick={() => {
                        this.shouldPanZoom = !this.shouldPanZoom
                        if (!this.nudgedPanZoomRotate?.currentTransform) return
                        window.location.hash = this.stringifyTransform(this.nudgedPanZoomRotate?.currentTransform.toArray(), this.shouldPanZoom)
                    }}
                >
                    {this.shouldPanZoom ? "Move pieces" : "Pan/Zoom"}
                </button>
                <button
                    disabled={this.isInErrorState}
                    className="button"
                    style={{ bottom: "0px", display: this.shouldPanZoom ? "initial" : "none" }}
                    onClick={() => {
                        if (this.fullscreen) {
                            document.exitFullscreen()
                            this.fullscreen = false
                        } else {
                            document.body.requestFullscreen()
                            this.fullscreen = true
                        }
                    }}
                >
                    Fullscreen
                </button>
                <button
                    disabled={this.isInErrorState}
                    style={{ left: "50%", transform: "translate(-50%, 0%)", display: this.shouldPanZoom ? "initial" : "none" }}
                    onClick={async () => {
                        this.nudgedPanZoomRotate?.rotate()
                    }}
                    className="button"
                >
                    Rotate
                </button>
                <button
                    style={{ left: "100%", transform: "translate(-100%, 0%)" }}
                    onClick={async () => {
                        await axios.post("/sign-out", null, {
                            headers: {
                                "X-CSRF-TOKEN": this.csrf
                            }
                        })
                        window.location.href = "/"
                    }}
                    className="button"
                >
                    Sign out
                </button>
            </div >
        )
    }

    onupdate() {
        this.panning = false
    }
}

function throttle(func: () => void, timeFrame: number) {
    let lastTime = 0
    let interval: NodeJS.Timeout
    return function () {
        const now = Date.now();
        if (now - lastTime >= timeFrame) {
            func();
            lastTime = now;
        } else {
            if (interval) {
                clearTimeout(interval)
            }
            interval = setTimeout(func, timeFrame)
        }
    };
}

const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))

    ReactDOM.render(
        <Board />,
        document.getElementById("view") as HTMLElement
    )
}

initApp()