const { addTestUser } = require("./addTestUser")

module.exports.addTestAdminUser = function (sequelize, username, password) {
    return addTestUser(sequelize, username, password)
}