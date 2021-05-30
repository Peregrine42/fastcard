const { createServer } = require("http")

let done = false
const sockets = new Set()
let backgroundReadyServer
const closeBackgroundReadyServer = async () => {
	return new Promise(callback => {
		for (const socket of sockets) {
			socket.destroy()

			sockets.delete(socket)
		}

		backgroundReadyServer.close(callback)
	})
}
backgroundReadyServer = createServer(async function (req, res) {
	res.writeHead(done ? 200 : 403, { 'Content-Type': 'text/plain' })
	res.end()
	if (done) {
		await closeBackgroundReadyServer()
	}
	if (req.url === "/done") {
		done = true
	}
})
backgroundReadyServer.on('connection', (socket) => {
	sockets.add(socket)

	backgroundReadyServer.once('close', () => {
		sockets.delete(socket)
	});
})

backgroundReadyServer.listen(8081, () => {
	console.log("background ready server waiting...")
})