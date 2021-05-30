module.exports = {
	up: async (queryInterface, _Sequelize) => {
		await queryInterface.sequelize.query(
			`
				create table users (
					id serial,
					username text unique not null,
					encrypted_password text not null,
					enabled boolean default true
				);
			`
		);
	},

	down: async (queryInterface, _Sequelize) => {
		await queryInterface.sequelize.query(
			`
				drop table users
			`
		);
	}
};
