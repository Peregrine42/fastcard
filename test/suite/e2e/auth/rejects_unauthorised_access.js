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

	it("prompts the user to sign in when they access a page without signing in", async function () {
		await addTestAdminUser(sequelize, process.env.TEST_USERNAME, process.env.TEST_PASSWORD)
		await browser.url("localhost:8080")
		browserLog("new page: ", await browser.getTitle())
		const result = await browser.getTitle()
		expect(result).to.match(/Sign in/)
	});
});