import axios from "axios"
import { serializeError } from "serialize-error"
import update from 'immutability-helper'
import { io, Socket } from 'socket.io-client'
import m, { Vnode, VnodeDOM } from "mithril"
import panzoom, { PanZoom } from "panzoom"
import classnames from "classnames"

// @ts-ignore
import nudged from "nudged"

const log = async (...args: any[]) => {
    console.log(...args)
    await axios.post("/log", {
        message: args.map(a => serializeError(a, { maxDepth: 50 }))
    })
}

const error = async (...args: any[]) => {
    console.error(...args)
    await axios.post("/log", {
        message: args.map(a => serializeError(a, { maxDepth: 50 }))
    })
}

interface ServerCard {
    id: number
    x: number
    y: number
    details: {
        z?: number
        name?: string
    }
}

class NudgedPanZoomRotate {
    currentTransform: any = null
    beforeDragTransform: any = null
    dom: any
    startPanX: number = 0
    startPanY: number = 0
    panning: boolean = false

    constructor(dom: any) {
        this.dom = dom
    }

    init() {
        this.currentTransform = nudged.Transform.IDENTITY
        this.beforeDragTransform = nudged.Transform.IDENTITY
        this.sync()
    }

    sync() {
        const { a, b, c, d, e, f } = this.currentTransform.getMatrix()
        this.dom.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
    }

    startPan(e: any) {
        this.startPanX = e.clientX
        this.startPanY = e.clientY
        this.beforeDragTransform = nudged.createFromArray(this.currentTransform.toArray())
        this.panning = true
    }

    continuePan(e: any) {
        this.currentTransform = this.beforeDragTransform.translateBy(
            e.clientX - this.startPanX,
            e.clientY - this.startPanY
        )
        this.sync()
    }

    endPan() {
        this.panning = false
    }

    onWheel(e: any) {
        const direction = e.deltaY > 0 ? 1.1 : 0.9
        const [x, y] = this.currentTransform.inverse().transform([e.clientX - (innerWidth / 2), e.clientY - (innerHeight / 2)])

        const newTransform = nudged.Transform.IDENTITY.scaleBy(direction, [x, y])
        this.currentTransform = this.currentTransform.multiplyBy(newTransform)
        this.sync()
    }

    rotate() {
        this.currentTransform = this.currentTransform.rotateBy(45 / 180 * Math.PI, [0, 0])
        this.sync()
    }
}

class Card {
    id: number
    name: string
    x: number
    y: number
    z: number
    realX: number
    realY: number

    constructor(c: ServerCard) {
        this.id = c.id
        this.name = c.details.name || "Untitled Card"
        this.x = c.x
        this.y = c.y
        this.realX = c.x
        this.realY = c.y
        this.z = c.details.z || 0
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
    pz?: PanZoom
    shouldPanZoom: boolean
    panning: boolean
    angle: number
    fullscreen: boolean
    isInErrorState: boolean
    nudgedPanZoomRotate: null | NudgedPanZoomRotate

    constructor(_vnode: Vnode) {
        this.cards = {}
        this.cs = []
        this.draggingCardId = null
        this.offset = [0, 0]
        this.isDown = false
        this.shouldPanZoom = false
        this.panning = false
        this.angle = 0
        this.fullscreen = false
        this.isInErrorState = false
        this.nudgedPanZoomRotate = null
    }

    stringifyTransform(transform: any, angle: number, shouldPanZoom: boolean) {
        if (transform) {
            return `${transform.x},${transform.y},${transform.scale},${angle % 360},${shouldPanZoom ? "pan" : "move"}`
        } else {
            return `${angle}`
        }
    }

    parseTransform(string?: string) {
        if (string) {
            const parts = string.split(",")
            if (parts.length === 5) {
                const [x, y, scale, angle, panOrMove] = string.split(",")
                this.shouldPanZoom = panOrMove === "pan"
                if (this.pz) {
                    if (this.shouldPanZoom) {
                        this.pz.resume()
                    } else {
                        this.pz.pause()
                    }
                    m.redraw()
                }
                return {
                    x: parseFloat(x),
                    y: parseFloat(y),
                    scale: parseFloat(scale),
                    angle: parseFloat(angle),
                }
            }
        }
        return { x: 0, y: 0, scale: 1, angle: 0 }
    }

    async oncreate(vnode: VnodeDOM<{ shouldPanZoom: boolean }>) {
        const dom = vnode.dom as HTMLElement
        const child = dom.getElementsByClassName("view-container")[0] as HTMLElement
        const { x, y, scale, angle } = this.parseTransform(window.location.hash.slice(1))

        this.angle = angle

        this.nudgedPanZoomRotate = new NudgedPanZoomRotate(child)
        this.nudgedPanZoomRotate.init()

        // this.pz = panzoom(child as HTMLElement, {
        //     smoothScroll: false,
        //     zoomDoubleClickSpeed: 1,
        //     initialX: x,
        //     initialY: y,
        //     initialZoom: scale
        // })

        // this.pz.moveTo(x, y)

        // if (!this.shouldPanZoom) {
        //     // this.pz.pause()
        // }

        // this.pz.on("transform", throttle(() => {
        //     window.location.hash = this.stringifyTransform(this.pz?.getTransform(), this.angle, this.shouldPanZoom)
        // }, 300))

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
            this.isInErrorState = true
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
                const card = new Card(c)
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
        cs.forEach(c => { if (c) { cardsById[c.id] = c } })

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
    }

    mouseDown(e: any) {
        if (!this.shouldPanZoom) return
        this.nudgedPanZoomRotate?.startPan(e)
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

        const [x, y] = this.nudgedPanZoomRotate?.currentTransform.transform([(e.target).offsetLeft, (e.target).offsetTop])

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
                this.nudgedPanZoomRotate?.endPan()
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
                    this.isInErrorState = true
                }
            }
            this.draggingCardId = null
        }
    }

    async mouseMove(
        e: {
            stopImmediatePropagation: () => void,
            preventDefault: () => void,
            clientX: number,
            clientY: number
        }
    ) {
        if (this.shouldPanZoom) {
            if (this.nudgedPanZoomRotate?.panning) {
                this.nudgedPanZoomRotate?.continuePan(e)
            }
        }
        e.stopImmediatePropagation()
        e.preventDefault();
        if (this.isDown && this.draggingCardId) {
            const card = this.cards[this.draggingCardId]
            const command: any = {}
            let transform = { scale: 1, x: 0, y: 0 }
            if (this.pz) {
                transform = this.pz.getTransform()
            }
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

    onWheel(e: any) {
        if (this.shouldPanZoom) {
            this.nudgedPanZoomRotate?.onWheel(e)
        }
    }

    view() {
        if (this.isInErrorState) {
            return (
                <div>Something went wrong. Please <button onclick={async () => {
                    await axios.get("/")
                    location.reload()
                }}>reload the page</button> to continue where you left off.</div>
            )
        }

        return (
            <div>
                <div id="view-inner">
                    <div
                        id="view-pane"
                        class={classnames({ unlocked: this.shouldPanZoom, locked: !this.shouldPanZoom })}
                        onwheel={(e: any) => this.onWheel(e)}
                        onmousemove={(e: MouseEvent) => this.mouseMove(e)}
                        onmouseup={(e: MouseEvent) => this.mouseUp(e)}
                        onmousedown={(e: MouseEvent) => this.mouseDown({
                            clientX: e.clientX || 0,
                            clientY: e.clientY || 0,
                            stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                            preventDefault: e.preventDefault.bind(e),
                            target: e.target as HTMLElement
                        })}
                        ontouchmove={(e: TouchEvent) => {
                            this.mouseMove({
                                clientX: e.touches[0]?.clientX || 0,
                                clientY: e.touches[0]?.clientY || 0,
                                stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                preventDefault: e.preventDefault.bind(e)
                            })
                        }}
                        ontouchend={(e: TouchEvent) => this.mouseUp({
                            clientX: e.touches[0]?.clientX || 0,
                            clientY: e.touches[0]?.clientY || 0,
                            stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                            preventDefault: e.preventDefault.bind(e)
                        })}
                    >
                        <div id="view-container" class="view-container">
                            {
                                (() => {
                                    return this.cs.map((c: any) => {
                                        return (
                                            <div
                                                style={{
                                                    transform: `translate(-50%, -50%)`,
                                                    top: c.y + "px",
                                                    left: c.x + "px"
                                                }}
                                                className={classnames({
                                                    "card": true,
                                                    "card-transition": (
                                                        !(this.panning) &&
                                                        !(this.draggingCardId === c.id)
                                                    )
                                                })}
                                                key={c.id}
                                                onmousedown={(e: MouseEvent) => this.mouseDownFor(c, {
                                                    clientX: e.clientX || 0,
                                                    clientY: e.clientY || 0,
                                                    stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                                    preventDefault: e.preventDefault.bind(e),
                                                    target: e.target as HTMLElement
                                                })}
                                                ontouchstart={(e: TouchEvent) => this.mouseDownFor(c, {
                                                    clientX: e.touches[0]?.clientX || 0,
                                                    clientY: e.touches[0]?.clientY || 0,
                                                    stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                                    preventDefault: e.preventDefault.bind(e),
                                                    target: e.touches[0]?.target as HTMLElement
                                                })}
                                            >
                                                {c.id}
                                            </div>
                                        )
                                    })
                                })()
                            }
                        </div>
                    </div>
                </div>
                <button
                    class="button"
                    onclick={(e: MouseEvent) => {
                        this.shouldPanZoom = !this.shouldPanZoom
                        if (this.pz) {
                            if (this.shouldPanZoom) {
                                this.pz.resume()
                            } else {
                                this.pz.pause()
                            }
                            window.location.hash = this.stringifyTransform(this.pz?.getTransform(), this.angle, this.shouldPanZoom)
                        }
                    }}
                >
                    {this.shouldPanZoom ? "Move pieces" : "Pan/Zoom"}
                </button>
                <button
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
                    style={{ left: "50%", transform: "translate(-50%, 0%)", display: this.shouldPanZoom ? "initial" : "none" }}
                    onclick={async () => {
                        // if (this.pz) {
                        //     const angleStride = 45

                        //     this.panning = true
                        //     this.angle += angleStride
                        //     this.redrawCards()
                        //     // const { x, y, scale } = this.pz.getTransform()
                        //     // const [newX, newY] = rotate(0, 0, x, y, angleStride)
                        //     // this.pz.moveTo(newX, newY)
                        //     const transform = this.pz.getTransform()
                        //     window.location.hash = this.stringifyTransform(transform, this.angle, this.shouldPanZoom)
                        // }
                        this.nudgedPanZoomRotate?.rotate()
                    }}
                    class="button"
                >
                    Rotate
                </button>
            </div>
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

function rotate(cx: number, cy: number, x: number, y: number, angle: number) {
    const radians = (Math.PI / 180) * angle,
        cos = Math.cos(radians),
        sin = Math.sin(radians),
        nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
        ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
    return [nx, ny];
}


const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))

    m.mount(
        document.getElementById('view') as HTMLElement,
        Board
    );
}

initApp().catch(e => error(e))