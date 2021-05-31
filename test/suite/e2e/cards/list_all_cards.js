const expect = require('chai').expect
const { browserLog } = require("../../../helpers/browserLog")
const { buildBrowser } = require("../../../helpers/buildBrowser")
const { getDbConnection } = require("../../../helpers/getDbConnection")
const { tryToSignInWith } = require("../../../helpers/tryToSignInWith")
const { resetDb } = require("../../../helpers/resetDb")
const { addTestAdminUser } = require("../../../helpers/addTestAdminUser")

let browser
let sequelize

async function addTestCard(name, ownerId = null, x = 0, y = 0, rotation = 0, facing = false) {
    await sequelize.query(`
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
}

describe("Cards", function () {
    beforeEach(async () => {
        browser = await buildBrowser()
        await browser.deleteCookies()
        sequelize = getDbConnection()
        await resetDb(sequelize)
    })

    it('can list all the public cards', async function () {
        await addTestCard("Card 1")
        await addTestCard("Card 2")
        await addTestCard("Card 3")
        await addTestCard("Card 4")

        await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        await browser.url("localhost:8080")
        browserLog("new page: ", await browser.getTitle())

        const loginResult = await tryToSignInWith(process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        expect(loginResult).to.equal(true)

        const cardsResult = await browser.$("#card-list")

        await browser.waitUntil(async () => {
            return (await cardsResult.getHTML(false)).match(/Card 1/)
        })

        expect(await cardsResult.getHTML(false)).to.match(/Card 1/)
        expect(await cardsResult.getHTML(false)).to.match(/Card 2/)
        expect(await cardsResult.getHTML(false)).to.match(/Card 3/)
        expect(await cardsResult.getHTML(false)).to.match(/Card 4/)
    });

    it('can list all the public cards, plus any cards owned by the current user', async function () {
        const userId = await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        const userId2 = await addTestAdminUser(sequelize, process.env.TEST_USERNAME + "2", process.env.TEST_PASSWORD)

        await addTestCard("Card 1")
        await addTestCard("Card 2", userId)
        await addTestCard("Card 3", userId2)

        await browser.url("localhost:8080")
        browserLog("new page: ", await browser.getTitle())

        const loginResult = await tryToSignInWith(process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        expect(loginResult).to.equal(true)

        const cardsResult = await browser.$("#card-list")

        await browser.waitUntil(async () => {
            return (await cardsResult.getHTML(false)).match(/Card 1/)
        })

        expect(await cardsResult.getHTML(false)).to.match(/Card 1/)
        expect(await cardsResult.getHTML(false)).to.match(/Card 2/)
        expect(await cardsResult.getHTML(false)).to.not.match(/Card 3/)
    });

    it('can update cards', async function () {
        const userId = await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)

        await addTestCard("Card 1", userId)
        await addTestCard("Card 2", userId)
        await addTestCard("Card 3", userId)
        await addTestCard("Card 4", userId)

        await browser.url("localhost:8080")
        browserLog("new page: ", await browser.getTitle())

        const loginResult = await tryToSignInWith(process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
        expect(loginResult).to.equal(true)

        await (await browser.$("#test-trigger")).click()

        const cardsResult = await browser.$("#card-list")

        await browser.waitUntil(async () => {
            return (await cardsResult.getHTML(false)).match(/Card\s+1\s+0\s+3\s+0\s+true/)
        })

        expect(await cardsResult.getHTML(false)).to.match(/Card\s+1\s+0\s+3\s+0\s+true/)
        expect(await cardsResult.getHTML(false)).to.match(/Card\s+2\s+1\s+2\s+90\s+false/)
        expect(await cardsResult.getHTML(false)).to.match(/Card\s+3\s+2\s+1\s+180\s+true/)
        expect(await cardsResult.getHTML(false)).to.match(/Card\s+4\s+3\s+0\s+270\s+false/)
    });
});