const expect = require('chai').expect
const { buildBrowser } = require("../../../helpers/buildBrowser")
const { getDbConnection } = require("../../../helpers/getDbConnection")
const { tryToSignInWith } = require("../../../helpers/tryToSignInWith")
const { resetDb } = require("../../../helpers/resetDb")
const { addTestAdminUser } = require("../../../helpers/addTestAdminUser")
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const { parse } = require('node-html-parser')

axiosCookieJarSupport(axios);

let browser
let sequelize

async function addTestCard(name, ownerId = null, x = 0, y = 0, rotation = 0, facing = false) {
    const [rows] = await sequelize.query(`
            insert into cards
            (
                x,
                y,
                details,
                updated_at,
                owner
            )
            values
            (
                $x,
                $y,
                $details,
                now(),
                $owner
            )
            returning id
        `, {
        bind: {
            x,
            y,
            details: {
                name,
                rotation,
                facing
            },
            owner: ownerId
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


        const cookieJar = await cliSignIn(
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
            withCredentials: true
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
                    },
                    "id": card1Id,
                    "x": 0,
                    "y": 3,
                },
                {
                    "details": {
                        "facing": false,
                        "name": "Card 2",
                        "rotation": 90
                    },
                    "id": card2Id,
                    "x": 1,
                    "y": 2,
                },
                {
                    "details": {
                        "facing": true,
                        "name": "Card 3",
                        "rotation": 180,
                    },
                    "id": card3Id,
                    "x": 2,
                    "y": 1
                },
                {
                    "details": {
                        "facing": false,
                        "name": "Card 4",
                        "rotation": 270,
                    },
                    "id": card4Id,
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

        const cookieJar = await cliSignIn(
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
            withCredentials: true
        })

        const response = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar,
            withCredentials: true
        })

        expect(response.data.cards[0].y).to.eq(10)

        const cookieJar2 = await cliSignIn(
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
        const userId2 = await addTestAdminUser(sequelize, process.env.TEST_USERNAME + "2", process.env.TEST_PASSWORD)
        const cardId = await addTestCard("Card 1", userId1)

        const cookieJar = await cliSignIn(
            process.env.TEST_USERNAME,
            process.env.TEST_PASSWORD,
        )

        const cookieJar2 = await cliSignIn(
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
            withCredentials: true
        })

        const response = await axios.get("http://localhost:8080/current-user/cards", {
            jar: cookieJar2,
            withCredentials: true
        })

        expect(response.data.cards.length).to.eq(1)
    })

    it('can list all the public cards, plus any cards owned by the current user', async function () {
        const userId = await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        const userId2 = await addTestAdminUser(sequelize, process.env.TEST_USERNAME + "2", process.env.TEST_PASSWORD)

        await addTestCard("Card 1", userId)
        await addTestCard("Card 2", userId)
        await addTestCard("Card 3", userId2)

        const cookieJar = await cliSignIn(
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
        withCredentials: true
    })

    return cookieJar
}