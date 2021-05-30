const { encrypt } = require("./encrypt")

module.exports.addTestUser = async function (sequelize, username, password) {
	await sequelize.query(
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
        `,
		{
			bind: { password: await encrypt(password), username }
		}
	);
}