import axios from "axios"
import { serializeError } from "serialize-error"
import ReactDOM from "react-dom"
import React, { useEffect, useState } from "react"
import update from 'immutability-helper'

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

const Board = ({ csrf }: { csrf: string }) => {
    const [cards, setCards] = useState<Card[]>([])

    const [draggingCardId, setDraggingCardId] = useState<number | null>(null);
    const [offset, setOffset] = useState<[x: number, y: number]>([0, 0]);
    const [isDown, setIsDown] = useState<boolean>(false);

    // initial load
    useEffect(() => {
        const init = async () => {
            const initialCardsResponse = await axios.get("/current-user/cards")
            const initialCards = [...initialCardsResponse.data.cards] as ServerCard[]
            const cards = initialCards.map(c => new Card(c))
            cards.sort((a, b) => {
                if (a.z > b.z) {
                    return 1
                } else {
                    return -1
                }
            })
            setCards(cards)
        }
        init()
    }, [])

    const mouseDownFor = (c: Card, e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        setIsDown(true);
        setOffset([
            (e.target as HTMLElement).offsetLeft - e.clientX,
            (e.target as HTMLElement).offsetTop - e.clientY
        ])
        setDraggingCardId(c.id)
    }

    const mouseUp = (_e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        setIsDown(false);

        const card = cards.find(c => c.id === draggingCardId)

        if (card) {
            axios.post("/current-user/cards", {
                cardUpdates: [
                    {
                        id: draggingCardId,
                        x: card.x,
                        y: card.y
                    }
                ]
            }, {
                headers: {
                    'X-CSRF-TOKEN': csrf
                }
            })
        }
    }

    const mouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        e.preventDefault();
        if (isDown) {
            const index = cards.findIndex(card => card.id === draggingCardId)
            const command: any = {}
            command[index] = {
                x: {
                    $set: (e.clientX + offset[0])
                },
                y: {
                    $set: (e.clientY + offset[1])
                }
            }
            const movedCards = update(cards, command)
            const card = movedCards[index]
            const restackedCards = update(movedCards, {
                $splice: [[index, 1]],
                $push: [card]
            })

            const zChanges: any = {}
            restackedCards.forEach((c, i) => {
                if (c.z !== i) {
                    zChanges[i] = {
                        z: {
                            $set: i
                        }
                    }
                }
            })
            const zCards = update(restackedCards, zChanges)
            setCards(zCards)

            const updates = Object.keys(zChanges).map((index) => {
                const card = zCards[parseInt(index)]
                return {
                    id: card.id,
                    details: {
                        z: card.z
                    }
                }
            })

            if (updates.length > 0) {
                axios.post("/current-user/cards", {
                    cardUpdates: updates
                }, {
                    headers: {
                        'X-CSRF-TOKEN': csrf
                    }
                })
            }
        }
    }

    return (
        <div
            className="view"
            onMouseUp={e => mouseUp(e)}
            onMouseMove={e => mouseMove(e)}
        >
            {
                (() => {
                    return cards.map((c) => {
                        return (
                            <div
                                style={{ top: c.y + "px", left: c.x + "px" }}
                                className="card"
                                key={c.id}
                                onMouseDown={e => mouseDownFor(c, e)}
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

const initApp = async () => {
    await new Promise(res => window.addEventListener("load", res))

    const el = document.getElementById("csrf_token") as HTMLElement
    const csrf = el.getAttribute("value") || ""

    ReactDOM.render(
        <Board csrf={csrf} />,
        document.getElementById('view')
    );
}

initApp().catch(e => error(e))