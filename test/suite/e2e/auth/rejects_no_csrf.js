const expect = require('chai').expect
const { browserLog } = require("../../../helpers/browserLog")
const { buildBrowser } = require("../../../helpers/buildBrowser")
const { getDbConnection } = require("../../../helpers/getDbConnection")
const { tryToSignInWith } = require("../../../helpers/tryToSignInWith")
const { resetDb } = require("../../../helpers/resetDb")
const { addTestAdminUser } = require("../../../helpers/addTestAdminUser")

let browser
let sequelize

describe("Auth", function () {
	beforeEach(async () => {
		browser = await buildBrowser()
		await browser.deleteCookies()
		sequelize = getDbConnection()
		await resetDb(sequelize)
	})

	it("rejects the user when CSRF isn't present", async function () {
		await addTestAdminUser(
			sequelize,
			process.env.TEST_USERNAME,
			process.env.TEST_PASSWORD
		)
		await browser.url("localhost:8080")

		const script = `
            document.getElementById("csrf_token").remove()
        `
		await browser.execute(script)
		const result = await tryToSignInWith(
			process.env.TEST_USERNAME,
			process.env.TEST_PASSWORD
		)
		browserLog("new page: ", await browser.getTitle())
		expect(result).to.equal(false)
	});
});