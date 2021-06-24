import axios from "axios"
import update from 'immutability-helper'
import { io, Socket } from 'socket.io-client'
import m, { Vnode, VnodeDOM } from "mithril"

// @ts-ignore
import nudged from "nudged"
import { serializeError } from "serialize-error"
import toastr from "toastr"

const log = async (...args: any[]) => {
    console.log(...args)
    const csrfEl = document.getElementById("csrf_token") as HTMLElement
    const csrf = csrfEl.getAttribute("value") || ""

    await axios.post("/log", {
        message: args.map(a => serializeError(a, { maxDepth: 50 }))
    }, {
        headers: {
            'X-CSRF-TOKEN': csrf
        }
    })
}

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

class NudgedPanZoomRotate {
    currentTransform: any = null
    beforeDragTransform: any = null
    startPanX: number = 0
    startPanY: number = 0
    startTouches: any[] = []
    panning: boolean = false
    onTransform: any
    pointers: any = {}
    committedTransform: any
    animationDurationStep = 150; //in miliseconds
    animationDuration: number = 0;
    startValue: null | number = null;
    endValue: null | number = null;
    startTime: null | number = null;
    animationCallback: any;
    animationStartTransform: any;
    animator: Animator

    constructor(onTransform: any, animator: Animator) {
        this.onTransform = onTransform
        this.animator = animator
    }

    async init() {
        this.currentTransform = nudged.Transform.IDENTITY
        this.beforeDragTransform = nudged.Transform.IDENTITY
        await this.sync(true)
    }

    async setTransform(transformArray: number[] | null) {
        if (!transformArray) this.currentTransform = nudged.Transform.IDENTITY
        else {
            this.currentTransform = nudged.createFromArray(transformArray)
        }
        await this.sync(true)
    }

    onAnimationFrame(callback: any) {
        this.animationCallback = callback;
    }

    animateRotation(ani: Animation, currentValue: number) {
        this.currentTransform = ani.startState.transform.rotateBy(
            currentValue * Math.PI / 180, [0, 0]
        )

        this.sync(true)

        if (this.animationCallback) {
            this.animationCallback(currentValue)
        }
    }

    async sync(isDone = false) {
        if (this.onTransform) this.onTransform()
        if (isDone) this.committedTransform = nudged.createFromArray(this.currentTransform.toArray())
    }

    startPan(e: any) {
        this.startPanX = e.clientX
        this.startPanY = e.clientY
        this.beforeDragTransform = nudged.createFromArray(this.currentTransform.toArray())
        this.panning = true
    }

    async continuePan(e: any) {
        this.currentTransform = this.beforeDragTransform.translateBy(
            e.clientX - this.startPanX,
            e.clientY - this.startPanY
        )
        await this.sync(true)
    }

    async endPan() {
        this.panning = false
        await this.sync(true)
    }

    async onWheel(e: any) {
        const direction = e.deltaY > 0 ? 1.1 : 0.9
        const [x, y] = this.currentTransform.inverse().transform([e.clientX - (innerWidth / 2), e.clientY - (innerHeight / 2)])

        const newTransform = nudged.Transform.IDENTITY.scaleBy(direction, [x, y])
        this.currentTransform = this.currentTransform.multiplyBy(newTransform)
        await this.sync(true)
    }

    async rotate() {
        return new Promise(res => {
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

    touchDragStart(touches: any[]) {
        this.startTouches = touches.map(t => { return { ...t } }).sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        this.beforeDragTransform = nudged.createFromArray(this.currentTransform.toArray())
        this.panning = true
    }

    async touchDrag(touches: any[]) {
        const domain = this.startTouches.map(t => [t.clientX, t.clientY])
        touches.sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        const range = touches.map(t => [t.clientX, t.clientY])
        this.currentTransform = this.currentTransform.multiplyBy(nudged.estimate("TS", domain, range))
        this.startTouches = touches.map(t => { return { ...t } }).sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        await this.sync(true)
    }

    startTouch(id: any, x: any, y: any) {
        this.commit()
        this.pointers[id] = { dx: x, dy: y, rx: x, ry: y }
        this.updateTransform()
    }

    async continueTouch(id: any, x: any, y: any) {
        if (this.pointers.hasOwnProperty(id)) {
            this.pointers[id].rx = x
            this.pointers[id].ry = y
            await this.updateTransform()
        }
    }

    async endTouch(id: any, x: any, y: any) {
        await this.commit()
        delete this.pointers[id]
    }

    async commit() {
        // Move ongoing transformation to the committed transformation so that
        // the total transformation stays the same.

        // Commit ongoingTransformation. As a result
        // the domain and range of all pointers become equal.
        let id: any, p: any, domain: any, range: any, t: any
        domain = []
        range = []
        for (id in this.pointers) {
            if (this.pointers.hasOwnProperty(id)) {
                p = this.pointers[id]
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
        t = nudged.estimateTS(domain, range)
        this.committedTransform = t.multiplyBy(this.committedTransform)
        this.currentTransform = this.committedTransform
        await this.sync(true)
    }

    async updateTransform() {
        // Calculate the total transformation from the committed transformation
        // and the points of the ongoing transformation.

        let id: any, p, domain: any, range: any, t
        domain = []
        range = []
        for (id in this.pointers) {
            if (this.pointers.hasOwnProperty(id)) {
                p = this.pointers[id]
                domain.push([p.dx, p.dy])
                range.push([p.rx, p.ry])
            }
        }
        // Calculate ongoing transform and combine it with the committed.
        t = nudged.estimateTS(domain, range)
        this.currentTransform = t.multiplyBy(this.committedTransform)
        await this.sync()
    }
}

class Canvas {
    dom: any
    ctx: any

    constructor(dom: any) {
        this.dom = dom
    }

    render({ a, b, c, d, e, f }: any, points: any[]) {
        if (!this.dom) return
        resizeCanvasToDisplaySize(this.dom)
        if (!this.ctx) {
            this.ctx = this.dom.getContext("2d")
        }

        this.ctx.clearRect(0, 0, this.dom.width, this.dom.height)
        this.ctx.save()

        this.ctx.translate(innerWidth / 2, innerHeight / 2)

        this.ctx.transform(
            a, b, c, d, e, f
        )

        points.forEach(point => {
            point.render(this.ctx)
        })

        this.ctx.restore()
    }
}

class HitCanvas {
    dom: any
    targetDom: any
    ctx: any
    objs: any[] = []
    colorMap: any[] = []

    constructor(dom: any, targetDom: any) {
        this.dom = dom
        this.targetDom = targetDom
    }

    setObjects(objs: any[]) {
        this.objs = objs
        this.colorMap = this.objs.map((o, C) => {
            const rgb = this.getRGB(C)
            return [o, rgb]
        })
    }

    getRGB(i: number) {
        const C = i + 1
        const B = C % 256
        const G = ((C - B) / 256) % 256
        const R = ((C - B) / Math.pow(256, 2)) - G / 256

        return `${R},${G},${B}`
    }

    getObjectAt(x: number, y: number) {
        const [R, G, B] = this.ctx.getImageData(x, y, 1, 1).data;
        const color = `${R},${G},${B}`
        const i = this.colorMap.findIndex(([o, c]) => {
            return c === color
        })

        if (i > -1) {
            return this.colorMap[i][0]
        } else {
            return null
        }
    }

    render({ a, b, c, d, e, f }: any, points: any[]) {
        if (!this.dom) return
        resizeCanvasToDisplaySize(
            this.dom,
            this.targetDom.clientWidth,
            this.targetDom.clientHeight
        )
        if (!this.ctx) {
            this.ctx = this.dom.getContext("2d")
        }

        this.ctx.clearRect(0, 0, this.dom.width, this.dom.height)
        this.ctx.save()

        this.ctx.translate(innerWidth / 2, innerHeight / 2)

        this.ctx.transform(
            a, b, c, d, e, f
        )

        points.forEach(point => {
            if (point.hitRender) {
                const index = this.colorMap.findIndex(([o, c]) => {
                    return o === point
                })

                if (index > -1) {
                    const [_o, color] = this.colorMap[index]

                    point.hitRender(this.ctx, color)
                } else {
                    console.error("not found in color map")
                }
            }
        })

        this.ctx.restore()
    }
}

interface Animation {
    name: string
    callback?: any
    done?: any
    startValue: number | null
    endValue: number | null
    startTime?: number | null
    duration: number
    elapsedTime?: number
    startState: any
}

class Animator {
    animations: Animation[] = []
    running = false

    frame(currentTime: number) {
        this.animations.forEach((ani) => {
            if (ani.endValue === null || ani.startValue === null) throw new Error('Animation start and end are null')
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
    x: number = 0
    y: number = 0
    z: number
    type = "shape"

    constructor({ id, details }: ServerShape) {
        this.id = id
        this.z = details.z || 0
        this.points = details.points || []
        this.name = details.name || "Untitled"
    }

    render(ctx: any) {
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

    render(ctx: any) {
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

    hitRender(ctx: any, color: string) {
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

class Board {
    userId?: number
    csrf?: string
    socket?: Socket
    cards: any
    draggingCardId: number | null
    offset: [number, number]
    isDown: boolean
    cs: any[]
    shouldPanZoom: boolean
    panning: boolean
    angle: number
    fullscreen: boolean
    isInErrorState: boolean
    nudgedPanZoomRotate: null | NudgedPanZoomRotate
    touches: any[] = []
    fullscreenToastr: any
    dom: any
    hitDom: any
    animator: Animator

    constructor(_vnode: Vnode) {
        this.cards = {}
        this.cs = []
        this.draggingCardId = null
        this.offset = [0, 0]
        this.isDown = false
        this.shouldPanZoom = true
        this.panning = false
        this.angle = 0
        this.fullscreen = false
        this.isInErrorState = false
        this.nudgedPanZoomRotate = null
        this.animator = new Animator()
    }

    stringifyTransform(transform: any, shouldPanZoom: boolean) {
        if (transform) {
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
                this.shouldPanZoom = panOrMove === "pan"
                return [
                    parseFloat(s),
                    parseFloat(r),
                    parseFloat(tx),
                    parseFloat(ty),
                ]
            }
        }
        return null
    }

    async oncreate(vnode: VnodeDOM<{}>) {
        window.addEventListener("resize", throttle(async () => {
            await this.reload(vnode)
        }, 1000))

        const success = document.getElementById("success")
        if (success) {
            const message = success.innerHTML
            success.innerHTML = ""
            toastr.success(message, "Success!", {
                positionClass: "toast-bottom-center"
            })
        }

        await this.reload(vnode)
    }

    within(val: number, target: number, margin: number) {
        return (
            val > (target - margin) && val < (target + margin)
        )
    }

    async reload(vnode: VnodeDOM<{}>) {
        const dom = vnode.dom
        const child = dom.getElementsByClassName("view-pane")[0] as HTMLElement
        const hitCanvasChild = dom.getElementsByClassName("view-hit-canvas")[0] as HTMLElement
        this.dom = new Canvas(child as HTMLElement)
        this.hitDom = new HitCanvas(
            hitCanvasChild as HTMLElement,
            child as HTMLElement
        )
        const transformArray = this.parseTransform(window.location.hash.slice(1))

        this.nudgedPanZoomRotate = new NudgedPanZoomRotate(throttle(() => {
            location.hash = this.stringifyTransform(this.nudgedPanZoomRotate?.currentTransform.toArray(), this.shouldPanZoom)
        }, 300), this.animator)

        this.nudgedPanZoomRotate.onAnimationFrame(() => {
            m.redraw()
        })

        this.nudgedPanZoomRotate.init()

        if (transformArray) {
            await this.nudgedPanZoomRotate.setTransform(transformArray)
        }

        const cardUpdateCallback = ({ fromUserId, cardUpdates: newStates }: { fromUserId: number, cardUpdates: any }) => {
            const command: any = {}
            newStates.forEach((s: any) => {
                if (s.id) {
                    const card = this.cards[s.id]
                    if (card) {
                        if (typeof (command[card.id]) === "undefined") {
                            command[card.id] = {}
                        }
                        if (
                            typeof (s.x) !== "undefined" &&
                            typeof (s.y) !== "undefined"
                        ) {
                            command[card.id]["x"] = {
                                $set: s.x + (innerWidth / 2)
                            }
                            command[card.id]["y"] = {
                                $set: s.y + (innerHeight / 2)
                            }

                            const sx = s.x + (innerWidth / 2)
                            const sy = s.y + (innerHeight / 2)

                            if (
                                (!this.within(card.x, sx, 5)) ||
                                (!this.within(card.y, sy, 5))
                            ) {
                                command[card.id]["startX"] = {
                                    $set: card.x
                                }
                                command[card.id]["startY"] = {
                                    $set: card.y
                                }
                            }
                        }
                        if (typeof (s.z) !== "undefined") {
                            command[card.id]["z"] = {
                                $set: s.z
                            }
                        }
                    }
                }
            })

            const newCards = update(this.cards, command)
            this.setCards(newCards)
            m.redraw()
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
            m.redraw()
        })

        this.socket.on('cardUpdate', cardUpdateCallback)

        await this.getInitialCardsFromServer()
        m.redraw()
    }

    redrawCards(initialCardsResponse: any = null) {
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
            cards = Object.values(this.cards) as Card[]
        }

        const cs = cards.map(card => {
            if (this.nudgedPanZoomRotate) {
                card.x = card.x + (innerWidth / 2)
                card.y = card.y + (innerHeight / 2)
                return card
            }
        })

        const cardsById: any = {}
        cs.forEach(c => {
            if (c) { cardsById[c.id] = c }
        })

        this.setCards(cardsById)
    }

    async getInitialCardsFromServer() {
        const initialCardsResponse = await axios.get("/current-user/cards")
        this.redrawCards(initialCardsResponse)
    }

    setCards(newCards: any) {
        this.cards = newCards
        this.cs = Object.values(this.cards)
        this.cs.sort((a: any, b: any) => {
            if (a.z > b.z) {
                return 1
            } else {
                return -1
            }
        })

        this.cs.forEach(c => {
            if (c?.type === "shape") {
                const shape = c as unknown as Shape
                shape.points.forEach((pointOrId, i) => {
                    if (typeof pointOrId === "number") {
                        shape.points.splice(i, 1, this.cards[pointOrId])
                    } else {
                        shape.points.splice(i, 1, this.cards[pointOrId.id])
                    }
                })
            } else if (c?.type === "card") {
                if (typeof (c.startX) !== "undefined" && typeof (c.startY) !== "undefined") {
                    const currentAni = this.animator.animations.find((ani) => ani.name === `card-update-${c.id}`)
                    if (!currentAni) {
                        this.animator.start({
                            elapsedTime: 0,
                            name: `card-update-${c.id}`,
                            startState: {},
                            duration: 150,
                            startValue: 0,
                            endValue: 1000,
                            callback: (_ani: any, currentValue: number) => {
                                const dx = c.x - c.startX
                                const dy = c.y - c.startY

                                const scaledDx = dx * (currentValue / 1000)
                                const scaledDy = dy * (currentValue / 1000)

                                c.animationX = c.startX + scaledDx
                                c.animationY = c.startY + scaledDy

                                this.render()
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
            }
        })

        this.hitDom.setObjects(this.cs)
    }

    mouseDown(e: any) {
        if (this.shouldPanZoom) {
            this.nudgedPanZoomRotate?.startPan(e)
        } else {
            const obj = this.hitDom.getObjectAt(e.clientX, e.clientY)
            if (obj) {
                this.mouseDownFor(obj, e)
            }
        }
    }

    mouseDownFor(
        c: Card,
        e: {
            stopImmediatePropagation: () => void,
            preventDefault: () => void,
            target: HTMLElement,
            clientX: number,
            clientY: number
        }
    ) {
        if (this.shouldPanZoom) return
        e.stopImmediatePropagation()
        this.isDown = true

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
            stopImmediatePropagation: () => void,
            preventDefault: () => void,
            clientX: number,
            clientY: number
        }
    ) {
        if (this.shouldPanZoom) {
            if (this.nudgedPanZoomRotate?.panning) {
                await this.nudgedPanZoomRotate?.endPan()
            }
        }
        e.stopImmediatePropagation()
        if (!this.isDown) return
        this.isDown = false

        if (this.draggingCardId) {
            const card = this.cards[this.draggingCardId]

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
                            'X-CSRF-TOKEN': this.csrf
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
        `, 'Disconnect', {
            timeOut: 0,
            hideDuration: 0,
            extendedTimeOut: 0,
            positionClass: 'toast-bottom-center',
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
            stopImmediatePropagation: () => void,
            preventDefault: () => void,
            clientX: number,
            clientY: number
        },
        pan = true
    ) {
        if (this.shouldPanZoom) {
            if (this.nudgedPanZoomRotate?.panning && pan) {
                await this.nudgedPanZoomRotate?.continuePan(e)
                return
            }
        }
        e.stopImmediatePropagation()
        e.preventDefault();
        if (this.isDown && this.draggingCardId) {
            const card = this.cards[this.draggingCardId]
            const command: any = {}
            const newX = e.clientX + this.offset[0]
            const newY = e.clientY + this.offset[1]

            if (this.nudgedPanZoomRotate) {
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
            const movedCards = update(this.cards, command)

            const zChanges: any = {}
            const cardList = Object.values(movedCards)
            if (card.type === "card") {
                cardList.forEach((c: any) => {
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
                        'X-CSRF-TOKEN': this.csrf
                    }
                })
            }
        }
    }

    async onWheel(e: any) {
        if (this.shouldPanZoom) {
            await this.nudgedPanZoomRotate?.onWheel(e)
        }
    }

    render() {
        this.dom?.render(
            this.nudgedPanZoomRotate?.currentTransform.getMatrix(),
            this.cs
        )
        this.hitDom?.render(
            this.nudgedPanZoomRotate?.currentTransform.getMatrix(),
            this.cs
        )
    }

    view(vnode: VnodeDOM) {
        this.render()
        return (
            <div>
                <div id="view-inner">
                    <canvas
                        id="view-hit-canvas"
                        class="view-hit-canvas"
                        style={{
                            display: "none"
                        }}
                    ></canvas>
                    <canvas
                        id="view-pane"
                        class="view-pane"
                        onwheel={(e: any) => this.onWheel(e)}
                        onmousemove={(e: MouseEvent) => this.mouseMove(e)}
                        onmouseup={(e: MouseEvent) => this.mouseUp(e)}
                        onmousedown={(e: MouseEvent) => {
                            this.mouseDown({
                                clientX: e.clientX || 0,
                                clientY: e.clientY || 0,
                                stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                preventDefault: e.preventDefault.bind(e),
                                target: e.target as HTMLElement
                            })
                        }}
                        ontouchstart={(e: TouchEvent) => {
                            e.preventDefault()
                            if (this.shouldPanZoom) {
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
                                    stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                    preventDefault: e.preventDefault.bind(e),
                                    target: e.target as HTMLElement
                                })
                            }
                        }}
                        ontouchmove={async (e: TouchEvent) => {
                            e.preventDefault()
                            if (this.shouldPanZoom) {
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
                                    stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                    preventDefault: e.preventDefault.bind(e)
                                }, false)
                            }
                        }}
                        ontouchend={async (e: TouchEvent) => {
                            e.preventDefault()
                            if (this.shouldPanZoom) {
                                for (let i = 0; i < e.changedTouches.length; i += 1) {
                                    const t = e.changedTouches[i]
                                    if (i > -1) {
                                        await this.nudgedPanZoomRotate?.endTouch(
                                            t.identifier,
                                            t.clientX - (innerWidth / 2),
                                            t.clientY - (innerHeight / 2),
                                        )
                                        this.touches.splice(i, 1)
                                    }
                                }
                            } else {
                                this.mouseUp({
                                    clientX: e.touches[0]?.clientX || 0,
                                    clientY: e.touches[0]?.clientY || 0,
                                    stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                    preventDefault: e.preventDefault.bind(e)
                                })
                            }
                        }}
                    >
                    </canvas>
                </div>
                <button
                    disabled={this.isInErrorState}
                    class="button"
                    onclick={(e: MouseEvent) => {
                        this.shouldPanZoom = !this.shouldPanZoom
                        window.location.hash = this.stringifyTransform(this.nudgedPanZoomRotate?.currentTransform.toArray(), this.shouldPanZoom)
                    }}
                >
                    {this.shouldPanZoom ? "Move pieces" : "Pan/Zoom"}
                </button>
                <button
                    disabled={this.isInErrorState}
                    class="button"
                    style={{ bottom: "0px", display: this.shouldPanZoom ? "initial" : "none" }}
                    onclick={() => {
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
                    onclick={async () => {
                        this.nudgedPanZoomRotate?.rotate()
                    }}
                    class="button"
                >
                    Rotate
                </button>
                <button
                    style={{ left: "100%", transform: "translate(-100%, 0%)" }}
                    onclick={async () => {
                        await axios.post("/sign-out", null, {
                            headers: {
                                'X-CSRF-TOKEN': this.csrf
                            }
                        })
                        window.location.href = "/"
                    }}
                    class="button"
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

function throttle(func: any, timeFrame: number) {
    let lastTime = 0;
    let interval: any = null;
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

    m.mount(
        document.getElementById('view') as HTMLElement,
        //@ts-ignore
        Board
    );
}

function resizeCanvasToDisplaySize(canvas: any, widthOverride?: number, heightOverride?: number) {
    // look up the size the canvas is being displayed
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;

    if (typeof (widthOverride) !== "undefined" && typeof (heightOverride) !== "undefined") {
        width = widthOverride
        height = heightOverride
    }

    // If it's resolution does not match change it
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }

    return false;
}

initApp()