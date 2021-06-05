import axios from "axios"
import { serializeError } from "serialize-error"
import update from 'immutability-helper'
import { io, Socket } from 'socket.io-client'
import m, { Vnode } from "mithril"

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

    constructor(vnode: Vnode) {
        this.cards = {}
        this.draggingCardId = null
        this.offset = [0, 0]
        this.isDown = false
    }

    async oncreate() {
        const cardUpdateCallback = ({ fromUserId, cardUpdates: newStates }: { fromUserId: number, cardUpdates: any }) => {
            const command: any = {}
            newStates.forEach((s: any) => {
                if (s.id) {
                    const card = this.cards[s.id]
                    if (card) {
                        if (typeof (command[card.id]) === "undefined") {
                            command[card.id] = {}
                        }

                        if (typeof (s.x) !== "undefined") {
                            command[card.id]["x"] = {
                                $set: s.x
                            }
                        }
                        if (typeof (s.y) !== "undefined") {
                            command[card.id]["y"] = {
                                $set: s.y
                            }
                        }
                    }
                }
            })

            const newCards = update(this.cards, command)
            this.cards = newCards
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
        const cs = initialCards.map(c => new Card(c))

        const cardsById: any = {}
        cs.forEach(c => cardsById[c.id] = c)

        this.cards = cardsById

        m.redraw()
    }

    mouseDownFor(c: Card, e: MouseEvent) {
        this.isDown = true
        this.offset = [
            (e.target as HTMLElement).offsetLeft - e.clientX,
            (e.target as HTMLElement).offsetTop - e.clientY
        ]
        this.draggingCardId = c.id
    }

    async mouseUp(_e: MouseEvent) {
        if (!this.isDown) return
        this.isDown = false

        if (this.draggingCardId) {
            const card = this.cards[this.draggingCardId]

            if (card) {
                await axios.post("/current-user/cards", {
                    cardUpdates: [
                        {
                            id: this.draggingCardId,
                            x: card.x,
                            y: card.y
                        }
                    ]
                }, {
                    headers: {
                        'X-CSRF-TOKEN': this.csrf
                    }
                })
            }
        }
    }

    async mouseMove(e: MouseEvent) {
        e.preventDefault();
        if (this.isDown && this.draggingCardId) {
            const card = this.cards[this.draggingCardId]
            const command: any = {}
            command[card.id] = {
                x: {
                    $set: (e.clientX + this.offset[0])
                },
                y: {
                    $set: (e.clientY + this.offset[1])
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
            this.cards = zCards

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
        const cs = Object.values(this.cards)
        cs.sort((a: any, b: any) => {
            if (a.z > b.z) {
                return 1
            } else {
                return -1
            }
        })

        return (
            <div
                className="view"
                onmouseup={(e: MouseEvent) => this.mouseUp(e)}
                onmousemove={(e: MouseEvent) => this.mouseMove(e)}
            >
                {
                    (() => {
                        return cs.map((c: any) => {
                            return (
                                <div
                                    style={{ top: c.y + "px", left: c.x + "px" }}
                                    className="card"
                                    key={c.id}
                                    onmousedown={(e: MouseEvent) => this.mouseDownFor(c, e)}
                                >
                                    {c.id}
                                </div>
                            )
                        })
                    })()
                }
            </div>
        )
    }
}

// const Board = ({ userId, csrf, socket }: { userId: number, csrf: string, socket: Socket }) => {
//     const [cards, setCards] = useState<any>({})
//     const cardsRef = useRef<any>(cards)
//     const [cardsSortedByZ, setCardsSortedByZ] = useState<any>([])

//     const [draggingCardId, setDraggingCardId] = useState<number | null>(null);
//     const [offset, setOffset] = useState<[x: number, y: number]>([0, 0]);
//     const [isDown, setIsDown] = useState<boolean>(false);

//     useEffect(() => {
//         cardsRef.current = cards;
//     }, [cards]);

//     // initial load
//     useEffect(() => {
//         const init = async () => {
//             const cardUpdateCallback = ({ fromUserId, cardUpdates: newStates }: { fromUserId: number, cardUpdates: any }) => {
//                 const command: any = {}
//                 newStates.forEach((s: any) => {
//                     if (s.id) {
//                         const card = cardsRef.current[s.id]
//                         if (card) {
//                             if (typeof (command[card.id]) === "undefined") {
//                                 command[card.id] = {}
//                             }

//                             if (typeof (s.x) !== "undefined") {
//                                 command[card.id]["x"] = {
//                                     $set: s.x
//                                 }
//                             }
//                             if (typeof (s.y) !== "undefined") {
//                                 command[card.id]["y"] = {
//                                     $set: s.y
//                                 }
//                             }
//                         }
//                     }
//                 })

//                 const newCards = update(cardsRef.current, command)
//                 setCards(newCards)
//             }

//             socket.on('cardUpdate', cardUpdateCallback)

//             const initialCardsResponse = await axios.get("/current-user/cards")
//             const initialCards = [...initialCardsResponse.data.cards] as ServerCard[]
//             const cs = initialCards.map(c => new Card(c))

//             const cardsById: any = {}
//             cs.forEach(c => cardsById[c.id] = c)

//             setCards(cardsById)
//         }
//         init()
//     }, [])

//     const mouseDownFor = (c: Card, e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
//         setIsDown(true);
//         setOffset([
//             (e.target as HTMLElement).offsetLeft - e.clientX,
//             (e.target as HTMLElement).offsetTop - e.clientY
//         ])
//         setDraggingCardId(c.id)
//     }

//     const mouseUp = async (_e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
//         if (!isDown) return
//         setIsDown(false);

//         if (draggingCardId) {
//             const card = cards[draggingCardId]

//             if (card) {
//                 await axios.post("/current-user/cards", {
//                     cardUpdates: [
//                         {
//                             id: draggingCardId,
//                             x: card.x,
//                             y: card.y
//                         }
//                     ]
//                 }, {
//                     headers: {
//                         'X-CSRF-TOKEN': csrf
//                     }
//                 })
//             }
//         }
//     }

//     const mouseMove = async (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
//         e.preventDefault();
//         if (isDown && draggingCardId) {
//             const card = cards[draggingCardId]
//             const command: any = {}
//             command[card.id] = {
//                 x: {
//                     $set: (e.clientX + offset[0])
//                 },
//                 y: {
//                     $set: (e.clientY + offset[1])
//                 }
//             }
//             const movedCards = update(cards, command)

//             const zChanges: any = {}
//             const cardList = Object.values(movedCards)
//             cardList.forEach((c: any) => {
//                 if (c.id === card.id) {
//                     if (c.z !== cardList.length - 1) {
//                         zChanges[c.id] = {
//                             z: {
//                                 $set: cardList.length - 1
//                             }
//                         }
//                     }
//                 } else if (c.z <= card.z) {
//                     return
//                 } else if (c.z > card.z) {
//                     zChanges[c.id] = {
//                         z: {
//                             $set: c.z - 1
//                         }
//                     }
//                 }
//             })
//             const zCards = update(movedCards, zChanges)
//             setCards(zCards)

//             const updates = Object.keys(zChanges).map((index) => {
//                 const card = zCards[index]
//                 return {
//                     id: card.id,
//                     details: {
//                         z: card.z
//                     }
//                 }
//             })

//             if (updates.length > 0) {
//                 await axios.post("/current-user/cards", {
//                     cardUpdates: updates
//                 }, {
//                     headers: {
//                         'X-CSRF-TOKEN': csrf
//                     }
//                 })
//             }
//         }
//     }

//     useEffect(() => {
//         const cs = Object.values(cards)
//         cs.sort((a: any, b: any) => {
//             if (a.z > b.z) {
//                 return 1
//             } else {
//                 return -1
//             }
//         })
//         setCardsSortedByZ(cs)
//     }, [cards])

//     return (
//         <div
//             className="view"
//             onMouseUp={e => mouseUp(e)}
//             onMouseMove={e => mouseMove(e)}
//         >
//             {
//                 (() => {
//                     return cardsSortedByZ.map((c: any) => {
//                         return (
//                             <div
//                                 style={{ top: c.y + "px", left: c.x + "px" }}
//                                 className="card"
//                                 key={c.id}
//                                 onMouseDown={e => mouseDownFor(c, e)}
//                             >
//                                 {c.id}
//                             </div>
//                         )
//                     })
//                 })()
//             }
//         </div>
//     )
// }

const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))

    m.mount(
        document.getElementById('view') as HTMLElement,
        Board
    );
}

initApp().catch(e => error(e))