import axios from "axios"
import { serializeError } from "serialize-error"
import update from 'immutability-helper'
import { io, Socket } from 'socket.io-client'
import m, { Vnode, VnodeDOM } from "mithril"
import panzoom, { PanZoom } from "panzoom"
import classnames from "classnames"

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

class Card {
    id: number
    name: string
    x: number
    y: number
    z: number

    constructor(c: ServerCard) {
        this.id = c.id
        this.name = c.details.name || "Untitled Card"
        this.x = c.x
        this.y = c.y
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

    constructor(_vnode: Vnode) {
        this.cards = {}
        this.cs = []
        this.draggingCardId = null
        this.offset = [0, 0]
        this.isDown = false
        this.shouldPanZoom = false
        this.panning = false
        this.angle = 0
    }

    onupdate(vnode: VnodeDOM<{ shouldPanZoom: boolean }>) {
        this.shouldPanZoom = vnode.attrs.shouldPanZoom
        if (this.pz) {
            if (this.shouldPanZoom) {
                this.pz.resume()
            } else {
                this.pz.pause()
            }
        }
    }

    stringifyTransform(transform: any, angle: number) {
        if (transform) {
            return `${transform.x},${transform.y},${transform.scale},${angle}`
        } else {
            return `${angle}`
        }
    }

    parseTransform(string?: string) {
        if (string) {
            const parts = string.split(",")
            if (parts.length === 4) {
                const [x, y, scale, angle] = string.split(",").map(part => parseFloat(part))
                return { x, y, scale, angle }
            }
        }
        return { x: 0, y: 0, scale: 1, angle: 0 }
    }

    async oncreate(vnode: VnodeDOM<{ shouldPanZoom: boolean }>) {
        const dom = vnode.dom as HTMLElement
        if (dom && dom.children[0]) {
            const { x, y, scale, angle } = this.parseTransform(window.location.hash.slice(1))

            this.angle = angle

            this.pz = panzoom(dom.children[0] as HTMLElement, {
                smoothScroll: false,
                initialX: x,
                initialY: y,
                initialZoom: scale
            })

            this.pz.moveTo(x, y)

            this.pz.on("transform", throttle(() => {
                window.location.hash = this.stringifyTransform(this.pz?.getTransform(), this.angle)
            }, 300))
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
                            const [x, y] = rotate(0, 0, s.x, s.y, this.angle)
                            command[card.id]["x"] = {
                                $set: x
                            }
                            command[card.id]["y"] = {
                                $set: y
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


        this.socket.on('cardUpdate', cardUpdateCallback)

        const initialCardsResponse = await axios.get("/current-user/cards")
        const initialCards = [...initialCardsResponse.data.cards] as ServerCard[]
        const cs = initialCards.map(c => {
            const [x, y] = rotate(0, 0, c.x, c.y, this.angle)
            c.x = x
            c.y = y
            return new Card(c)
        })

        const cardsById: any = {}
        cs.forEach(c => cardsById[c.id] = c)

        this.setCards(cardsById)
        m.redraw()
    }

    setCards(newCards: any[]) {
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
        let transform = { scale: 1, x: 0, y: 0 }
        if (this.pz) {
            transform = this.pz.getTransform()
        }
        this.offset = [
            (e.target).offsetLeft - (e.clientX / transform.scale),
            (e.target).offsetTop - (e.clientY / transform.scale)
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
        if (this.shouldPanZoom) return
        e.stopImmediatePropagation()
        if (!this.isDown) return
        this.isDown = false

        if (this.draggingCardId) {
            const card = this.cards[this.draggingCardId]

            if (card) {
                const [x, y] = rotate(0, 0, card.x, card.y, -this.angle)

                await axios.post("/current-user/cards", {
                    cardUpdates: [
                        {
                            id: this.draggingCardId,
                            x: x,
                            y: y
                        }
                    ]
                }, {
                    headers: {
                        'X-CSRF-TOKEN': this.csrf
                    }
                })
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
        if (this.shouldPanZoom) return
        e.stopImmediatePropagation()
        e.preventDefault();
        if (this.isDown && this.draggingCardId) {
            const card = this.cards[this.draggingCardId]
            const command: any = {}
            let transform = { scale: 1, x: 0, y: 0 }
            if (this.pz) {
                transform = this.pz.getTransform()
            }
            const newX = ((e.clientX) / transform.scale) + this.offset[0]
            const newY = ((e.clientY) / transform.scale) + this.offset[1]

            const [x, y] = [newX, newY]

            command[card.id] = {
                x: {
                    $set: x
                },
                y: {
                    $set: y
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

    view() {
        return (
            <div
                id="view-pane"
                className="view"
                onmousemove={(e: MouseEvent) => this.mouseMove(e)}
                onmouseup={(e: MouseEvent) => this.mouseUp(e)}
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
                <div id="view-container">
                    {
                        (() => {
                            return this.cs.map((c: any) => {
                                return (
                                    <div
                                        style={{
                                            transform: `translate(-50%, -50%) rotate(${-this.angle}deg)`,
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
                                        onmousedown={(e: MouseEvent) => this.mouseDownFor(c, e)}
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
        )
    }
}

class App {
    shouldPanZoom: boolean
    fullscreen: boolean

    constructor(vnode: Vnode) {
        this.shouldPanZoom = false
        this.fullscreen = false
    }

    view() {
        return (
            <div>
                <div id="view-inner">
                    <Board shouldPanZoom={this.shouldPanZoom}></Board>
                </div>
                <button
                    onclick={(e: MouseEvent) => {
                        e.stopImmediatePropagation()
                        this.shouldPanZoom = !this.shouldPanZoom
                    }}
                >
                    Pan/Zoom
                </button>
                <button style={{ bottom: "0px" }} onclick={() => {
                    if (this.fullscreen) {
                        document.exitFullscreen()
                        this.fullscreen = false
                    } else {
                        document.body.requestFullscreen()
                        this.fullscreen = true
                    }
                }}>Fullscreen</button>
            </div>
        )
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
        App
    );
}

initApp().catch(e => error(e))