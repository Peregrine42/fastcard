const argon2 = require("argon2")

async function encrypt(password) {
	const result = await argon2.hash(password, { type: argon2.argon2id })
	return result
}

module.exports = {
	encrypt
}