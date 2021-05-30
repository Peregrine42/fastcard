const expect = require('chai').expect
const { browserLog } = require("../../../helpers/browserLog")
const { buildBrowser } = require("../../../helpers/buildBrowser")

let browser

describe("Auth", function () {
    beforeEach(async () => {
        browser = await buildBrowser()
        await browser.deleteCookies()
    })

    it('auto-focuses on the username field', async function () {
        await browser.url("localhost:8080")
        browserLog("new page: ", await browser.getTitle())
        await browser.waitUntil(async () => {
            return (await browser.$("#username")).isFocused()
        })
        const isUsernameFocused = await (await browser.$("#username")).isFocused()
        expect(isUsernameFocused).to.equal(true)
    });
});