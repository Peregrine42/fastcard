const { addTestUser } = require("./addTestUser")

module.exports.addTestAdminUser = async function (sequelize, username, password) {
    await addTestUser(sequelize, username, password)
}