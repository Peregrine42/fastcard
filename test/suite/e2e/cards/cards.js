const chai = require('chai')
const expect = chai.expect
const chaiSubset = require('chai-subset');
const { buildBrowser } = require("../../../helpers/buildBrowser")
const { getDbConnection } = require("../../../helpers/getDbConnection")
const { resetDb } = require("../../../helpers/resetDb")
const { addTestAdminUser } = require("../../../helpers/addTestAdminUser")
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const { parse } = require('node-html-parser')

chai.use(chaiSubset)
axiosCookieJarSupport(axios);

let browser
let sequelize

async function addTestCard(
    name,
    ownerId = null,
    x = 0,
    y = 0,
    rotation = 0,
    facing = false,
    back = "back.jpg",
    front = "facing.jpg",
    z = 0
) {
    const url = facing ? front : back
    const [rows] = await sequelize.query(`
            insert into cards
            (
                x,
                y,
                details,
                updated_at,
                owner,
                back,
                front,
                url
            )
            values
            (
                $x,
                $y,
                $details,
                now(),
                $owner,
                $back,
                $front,
                $url
            )
            returning id
        `, {
        bind: {
            x,
            y,
            details: {
                name,
                rotation,
                facing,
                z,
            },
            owner: ownerId,
            back,
            front,
            url
        }
    })
    return rows[0].id
}

describe("Cards", function () {
    beforeEach(async () => {
        browser = await buildBrowser()
        await browser.deleteCookies()
        sequelize = getDbConnection()
        await resetDb(sequelize)
    })

    it('can update cards', async function () {
        const userId = await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)

        const card1Id = await addTestCard("Card 1", userId)
        const card2Id = await addTestCard("Card 2", userId)
        const card3Id = await addTestCard("Card 3", userId)
        const card4Id = await addTestCard("Card 4", userId)


        const { cookieJar, csrf } = await cliSignIn(
            process.env.TEST_USERNAME,
            process.env.TEST_PASSWORD,
        )

        const ids = [card3Id, card4Id, card2Id, card1Id]
        const xs = [2, 3, 1, 0]
        const ys = [1, 0, 2, 3]
        const rotations = [180, 270, 90, 0]
        const facings = [true, false, false, true]
        await axios.post("http://localhost:8080/current-user/cards", {
            cardUpdates: ids.map((id, i) => {
                return {
                    id,
                    x: xs[i],
                    y: ys[i],
                    details: {
                        rotation: rotations[i],
                        facing: facings[i],
                    }
                }
            })
        }, {
            jar: cookieJar,
            withCredentials: true,
            headers: {
                'X-CSRF-TOKEN': csrf
            }
        })

        const list = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(list.data.cards).to.deep.equal(
            [
                {
                    "details": {
                        "facing": true,
                        "name": "Card 1",
                        "rotation": 0,
                        "z": 0
                    },
                    "id": card1Id,
                    "url": "back.jpg",
                    "x": 0,
                    "y": 3,
                },
                {
                    "details": {
                        "facing": false,
                        "name": "Card 2",
                        "rotation": 90,
                        "z": 0
                    },
                    "id": card2Id,
                    "url": "back.jpg",
                    "x": 1,
                    "y": 2,
                },
                {
                    "details": {
                        "facing": true,
                        "name": "Card 3",
                        "rotation": 180,
                        "z": 0
                    },
                    "id": card3Id,
                    "url": "back.jpg",
                    "x": 2,
                    "y": 1
                },
                {
                    "details": {
                        "facing": false,
                        "name": "Card 4",
                        "rotation": 270,
                        "z": 0
                    },
                    "id": card4Id,
                    "url": "back.jpg",
                    "x": 3,
                    "y": 0,
                }
            ]
        )
    });

    it('can grab a card', async () => {
        await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        await addTestAdminUser(sequelize, process.env.TEST_USERNAME + "2", process.env.TEST_PASSWORD)
        const cardId = await addTestCard("Card 1")

        const { cookieJar, csrf } = await cliSignIn(
            process.env.TEST_USERNAME,
            process.env.TEST_PASSWORD,
        )

        await axios.post("http://localhost:8080/current-user/cards", {
            cardGrabs: [
                cardId
            ],
            cardUpdates: [
                {
                    id: cardId,
                    y: 10
                }
            ]
        }, {
            jar: cookieJar,
            withCredentials: true,
            headers: {
                'X-CSRF-TOKEN': csrf
            }
        })

        const response = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(response.data.cards[0].y).to.eq(10)

        const { cookieJar: cookieJar2 } = await cliSignIn(
            process.env.TEST_USERNAME + "2",
            process.env.TEST_PASSWORD,
        )

        const response2 = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar2,
            withCredentials: true
        })

        expect(response2.data.cards.length).to.eq(0)
    })

    it('can drop a card', async () => {
        const userId1 = await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        await addTestAdminUser(sequelize, process.env.TEST_USERNAME + "2", process.env.TEST_PASSWORD)
        const cardId = await addTestCard("Card 1", userId1)

        const { cookieJar, csrf } = await cliSignIn(
            process.env.TEST_USERNAME,
            process.env.TEST_PASSWORD,
        )

        const { cookieJar: cookieJar2, csrf: csrf2 } = await cliSignIn(
            process.env.TEST_USERNAME + "2",
            process.env.TEST_PASSWORD,
        )

        const initialCheck = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar2,
            withCredentials: true
        })

        expect(initialCheck.data.cards.length).to.eq(0)

        await axios.post("http://localhost:8080/current-user/cards", {
            cardDrops: [
                cardId
            ],
        }, {
            jar: cookieJar,
            withCredentials: true,
            headers: {
                'X-CSRF-TOKEN': csrf
            }
        })

        const response = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar2,
            withCredentials: true
        })

        expect(response.data.cards.length).to.eq(1)
    })

    it('can flip a card', async () => {
        await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        const cardId = await addTestCard(
            "Card 1",
            null, 0, 0, 0, false,
            "initial-image.jpg",
            "other-image.jpg"
        )

        const { cookieJar, csrf } = await cliSignIn(
            process.env.TEST_USERNAME,
            process.env.TEST_PASSWORD,
        )

        const initialCheck = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(initialCheck.data.cards.length).to.eq(1)
        expect(initialCheck.data.cards[0].details.facing).to.eq(false)
        expect(initialCheck.data.cards[0].front).to.be.undefined
        expect(initialCheck.data.cards[0].back).to.be.undefined
        expect(initialCheck.data.cards[0].url).to.eq("initial-image.jpg")

        const initialId = initialCheck.data.cards[0].id

        await axios.post("http://localhost:8080/current-user/cards", {
            cardFlips: [
                cardId
            ],
        }, {
            jar: cookieJar,
            withCredentials: true,
            headers: {
                'X-CSRF-TOKEN': csrf
            }
        })

        const response = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(response.data.cards.length).to.eq(1)
        expect(response.data.cards[0].details.facing).to.eq(true)
        expect(response.data.cards[0].details.id).to.not.eq(initialId)
        expect(response.data.cards[0].url).to.eq("other-image.jpg")
    })

    it('can shuffle cards', async () => {
        await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        const cardId1 = await addTestCard(
            "Card 1",
            null, 0, 0, 0, false,
            "1.jpg",
            "other.jpg",
            1
        )
        const cardId2 = await addTestCard(
            "Card 2",
            null, 0, 0, 0, false,
            "2.jpg",
            "other.jpg",
            2
        )
        const cardId3 = await addTestCard(
            "Card 3",
            null, 0, 0, 0, false,
            "3.jpg",
            "other.jpg",
            3
        )
        const cardId4 = await addTestCard(
            "Card 4",
            null, 0, 0, 0, false,
            "4.jpg",
            "other.jpg",
            4
        )


        const { cookieJar, csrf } = await cliSignIn(
            process.env.TEST_USERNAME,
            process.env.TEST_PASSWORD,
        )

        await axios.post("http://localhost:8080/current-user/cards", {
            cardShuffles: [
                cardId1,
                cardId2,
                cardId3,
                cardId4,
            ],
        }, {
            jar: cookieJar,
            withCredentials: true,
            headers: {
                'X-CSRF-TOKEN': csrf
            }
        })

        const response = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(response.data.cards).to.containSubset(
            [
                {
                    "details": {
                        "facing": false,
                        "name": "Card 1",
                        "rotation": 0,
                        "z": 1
                    },
                    "url": "1.jpg",
                    "x": 0,
                    "y": 0,
                },
                {
                    "details": {
                        "facing": false,
                        "name": "Card 2",
                        "rotation": 0,
                        "z": 3
                    },
                    "url": "2.jpg",
                    "x": 0,
                    "y": 0,
                },
                {
                    "details": {
                        "facing": false,
                        "name": "Card 3",
                        "rotation": 0,
                        "z": 4
                    },
                    "url": "3.jpg",
                    "x": 0,
                    "y": 0
                },
                {
                    "details": {
                        "facing": false,
                        "name": "Card 4",
                        "rotation": 0,
                        "z": 2
                    },
                    "url": "4.jpg",
                    "x": 0,
                    "y": 0,
                }
            ]
        )

        const check = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(check.data.cards.find(c => c.details.name === "Card 1").id).to.not.eq(cardId1)
        expect(check.data.cards.find(c => c.details.name === "Card 2").id).to.not.eq(cardId2)
        expect(check.data.cards.find(c => c.details.name === "Card 3").id).to.not.eq(cardId3)
        expect(check.data.cards.find(c => c.details.name === "Card 4").id).to.not.eq(cardId4)
    })

    it('can list all the public cards, plus any cards owned by the current user', async function () {
        const userId = await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        const userId2 = await addTestAdminUser(sequelize, process.env.TEST_USERNAME + "2", process.env.TEST_PASSWORD)

        await addTestCard("Card 1", userId)
        await addTestCard("Card 2", userId)
        await addTestCard("Card 3", userId2)

        const { cookieJar } = await cliSignIn(
            process.env.TEST_USERNAME,
            process.env.TEST_PASSWORD,
        )

        const response = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(response.data.cards.length).to.eq(2)
        expect(response.data.cards[0].details.name).to.eq("Card 1")
        expect(response.data.cards[1].details.name).to.eq("Card 2")
    })
});

async function cliSignIn(username, password) {
    const cookieJar = new tough.CookieJar();

    const signInForm = await axios.get("http://localhost:8080/sign-in", {
        jar: cookieJar,
        withCredentials: true
    })

    const html = parse(signInForm.data)
    const csrf = html.querySelector("#csrf_token").getAttribute("value")

    await axios.post("http://localhost:8080/sign-in", {
        csrf_token: csrf,
        username,
        password,
    }, {
        jar: cookieJar,
        withCredentials: true,
        headers: {
            'X-CSRF-TOKEN': csrf
        }
    })

    return { cookieJar, csrf }
}