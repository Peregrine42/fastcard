module.exports = {
    serverLog: function (...messages) {
        console.log('\x1b[33m%s\x1b[0m', messages.join(" "))
    }
}