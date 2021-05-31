const expect = require('chai').expect
const { browserLog } = require("../../../helpers/browserLog")
const { buildBrowser } = require("../../../helpers/buildBrowser")
const { getDbConnection } = require("../../../helpers/getDbConnection")
const { tryToSignInWith } = require("../../../helpers/tryToSignInWith")
const { resetDb } = require("../../../helpers/resetDb")
const { addTestAdminUser } = require("../../../helpers/addTestAdminUser")

let browser
let sequelize

async function addTestCard(name) {
    await sequelize.query(`
            insert into cards
            (
                x,
                y,
                details,
                updated_at
            )
            values
            (
                $x,
                $y,
                $details,
                now()
            )
        `, {
        bind: {
            x: 0,
            y: 0,
            details: {
                name
            }
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

    it('can list all the cards', async function () {
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
        expect(await cardsResult.getHTML(false)).to.match(/Card 1/)
        expect(await cardsResult.getHTML(false)).to.match(/Card 2/)
        expect(await cardsResult.getHTML(false)).to.match(/Card 3/)
        expect(await cardsResult.getHTML(false)).to.match(/Card 4/)
    });
});