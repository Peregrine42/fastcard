module.exports.resetDb = async function (sequelize) {
    await sequelize.query(
        `
          delete from cards;
          delete from users;
        `,
    );
}