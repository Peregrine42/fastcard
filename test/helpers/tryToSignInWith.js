const { browserLog } = require("./browserLog")
const { buildBrowser } = require("./buildBrowser")

module.exports.tryToSignInWith = async function (username, password) {
    const browser = await buildBrowser()
    const usernameField = await browser.$("#username")
    await usernameField.setValue(username)
    const passwordField = await browser.$("#password")
    await passwordField.setValue(password)
    const submit = await browser.$("#submit")
    await submit.click()
    browserLog("new page: ", await browser.getTitle())

    const signInMessage = await browser.$("#success")
    if (await signInMessage.isExisting()) {
        return (await signInMessage.getText()) === "Sign in complete"
    } else {
        return false
    }
}