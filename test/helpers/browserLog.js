module.exports = {
    browserLog: function (...messages) {
        console.log('\x1b[36m%s\x1b[0m', messages.join(" "))
    }
}