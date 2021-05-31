const { encrypt } = require("./encrypt")

module.exports.addTestUser = async function (sequelize, username, password) {
    const [rows] = await sequelize.query(
        `
          insert into users (
              username,
              encrypted_password,
              enabled
          ) values (
              $username,
              $password,
              't'
          )
          returning id
        `,
        {
            bind: { password: await encrypt(password), username }
        }
    );

    return rows[0].id
}