import axios from "axios"
import update from 'immutability-helper'
import { io, Socket } from 'socket.io-client'
import m, { Vnode, VnodeDOM } from "mithril"
import classnames from "classnames"

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
    }
}

class NudgedPanZoomRotate {
    currentTransform: any = null
    beforeDragTransform: any = null
    dom: any
    startPanX: number = 0
    startPanY: number = 0
    startTouches: any[] = []
    panning: boolean = false
    onTransform: any
    pointers: any = {}
    committedTransform: any
    // totalTransform: any

    constructor(dom: any, onTransform: any) {
        this.dom = dom
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
        this.sync(true)
    }

    sync(isDone = false) {
        const { a, b, c, d, e, f } = this.currentTransform.getMatrix()
        this.dom.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
        if (this.onTransform) this.onTransform()
        if (isDone) this.committedTransform = nudged.createFromArray(this.currentTransform.toArray())

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
        this.sync(true)
    }

    endPan() {
        this.panning = false
        this.sync(true)
    }

    onWheel(e: any) {
        const direction = e.deltaY > 0 ? 1.1 : 0.9
        const [x, y] = this.currentTransform.inverse().transform([e.clientX - (innerWidth / 2), e.clientY - (innerHeight / 2)])

        const newTransform = nudged.Transform.IDENTITY.scaleBy(direction, [x, y])
        this.currentTransform = this.currentTransform.multiplyBy(newTransform)
        this.sync(true)
    }

    rotate() {
        this.currentTransform = this.currentTransform.rotateBy(45 / 180 * Math.PI, [0, 0])
        this.sync(true)
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

    touchDrag(touches: any[]) {
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
        this.sync(true)
    }

    startTouch(id: any, x: any, y: any) {
        this.commit()
        this.pointers[id] = { dx: x, dy: y, rx: x, ry: y }
        this.updateTransform()
    }

    continueTouch(id: any, x: any, y: any) {
        if (this.pointers.hasOwnProperty(id)) {
            this.pointers[id].rx = x
            this.pointers[id].ry = y
            this.updateTransform()
        }
    }

    endTouch(id: any, x: any, y: any) {
        this.commit()
        delete this.pointers[id]
    }

    commit() {
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
        this.sync(true)
    }

    updateTransform() {
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
    shouldPanZoom: boolean
    panning: boolean
    angle: number
    fullscreen: boolean
    isInErrorState: boolean
    nudgedPanZoomRotate: null | NudgedPanZoomRotate
    touches: any[] = []

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

    async reload(vnode: VnodeDOM<{}>) {
        const supportsTouch = 'ontouchstart' in window || navigator.msMaxTouchPoints;
        if (supportsTouch && !this.fullscreen) {
            toastr.info(`
            <div style="font-size: 40px">
                Touchscreen devices work best in fullscreen mode.
                <button style="font-size: 40px" id="info-button"> 
                    Go fullscreen
                </button>
                <p>(You can exit fullscreen at any time)</p>
            </div>
        `, 'Info', {
                timeOut: 0,
                toastClass: 'toaster-center-inner',
                iconClass: 'hidden',
                hideDuration: 0,
                extendedTimeOut: 0,
                positionClass: 'toaster-center',
                preventDuplicates: true,
                onShown: () => {
                    const el = document.getElementById("info-button")
                    if (el) {
                        el.addEventListener("click", async () => {
                            document.body.requestFullscreen()
                            this.fullscreen = true
                            this.reload(vnode)
                        })
                    }
                }
            })
        }

        if (supportsTouch && !this.fullscreen) return

        const dom = vnode.dom as HTMLElement
        const child = dom.getElementsByClassName("view-container")[0] as HTMLElement
        const transformArray = this.parseTransform(window.location.hash.slice(1))

        this.nudgedPanZoomRotate = new NudgedPanZoomRotate(child, throttle(() => {
            location.hash = this.stringifyTransform(this.nudgedPanZoomRotate?.currentTransform.toArray(), this.shouldPanZoom)
        }, 300))
        this.nudgedPanZoomRotate.init()

        this.nudgedPanZoomRotate.setTransform(transformArray)

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
                    this.showErrorState()
                }
            }
            this.draggingCardId = null
        }
    }

    showErrorState() {
        this.isInErrorState = true
        toastr.error(`
            Something went wrong. 
            Please 
            <button id="error-button"> 
                reload the page
            </button> to continue.
        `, 'Error', {
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
                return this.nudgedPanZoomRotate?.continuePan(e)
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
        return (
            <div>
                <div id="view-inner">
                    <div
                        id="view-pane"
                        class={classnames({
                            error: this.isInErrorState
                        })}
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
                        ontouchmove={(e: TouchEvent) => {
                            if (this.shouldPanZoom) {
                                Array.from(e.changedTouches).forEach(t => {
                                    if (!this.touches.map(to => to.identifier).includes(t.identifier)) {
                                        this.nudgedPanZoomRotate?.startTouch(
                                            t.identifier,
                                            t.clientX - (innerWidth / 2),
                                            t.clientY - (innerHeight / 2),
                                        )
                                        this.touches.push({ identifier: t.identifier })
                                    } else {
                                        this.nudgedPanZoomRotate?.continueTouch(
                                            t.identifier,
                                            t.clientX - (innerWidth / 2),
                                            t.clientY - (innerHeight / 2),
                                        )
                                    }
                                })
                            } else {
                                this.mouseMove({
                                    clientX: e.touches[0]?.clientX || 0,
                                    clientY: e.touches[0]?.clientY || 0,
                                    stopImmediatePropagation: e.stopImmediatePropagation.bind(e),
                                    preventDefault: e.preventDefault.bind(e)
                                }, false)
                            }
                        }}
                        ontouchend={(e: TouchEvent) => {
                            if (this.shouldPanZoom) {
                                Array.from(e.changedTouches).forEach(t => {
                                    const index = this.touches.findIndex(to => to.identifier === t.identifier)
                                    if (index > -1) {
                                        this.nudgedPanZoomRotate?.endTouch(
                                            t.identifier,
                                            t.clientX - (innerWidth / 2),
                                            t.clientY - (innerHeight / 2),
                                        )
                                        this.touches.splice(index, 1)
                                    }
                                })
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
        Board
    );
}

initApp()