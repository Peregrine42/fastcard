'use strict';

module.exports = {
	up: async (queryInterface, _Sequelize) => {
		await queryInterface.sequelize.query(
			`
				create table cards (
					id serial unique,
					owner int,
					FOREIGN KEY(owner) 
   					REFERENCES users(id),
					x integer not null,
					y integer not null,
					details jsonb not null,
					back text,
					front text,
					url text,
					enabled boolean default true,
					updated_at timestamp not null
				);
				create index cards_owner on cards (owner);
				create index cards_x_y on cards (x, y);
			`
		)
	},

	down: async (queryInterface, _Sequelize) => {
		await queryInterface.sequelize.query(
			`
				drop table cards
			`
		);
	}
};
