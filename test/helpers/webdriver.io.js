const shell = require("shelljs")
const kill = require("tree-kill")
const execa = require('execa')
const axios = require("axios").default
const cp = require('child_process')

let driverChild
let testChild
let verbose = !!process.env.DEBUG

function debug(...messages) {
    if (verbose) {
        console.debug(...messages)
    }
}

function sleep(interval) {
    return new Promise(res => {
        setTimeout(res, interval)
    })
}

async function killAll(child) {
    await new Promise(res => {
        kill(child.pid, res)
    })
    await driverChild.kill()
}

process.on("unhandledRejection", async (err) => {
    console.error(err)
    process.exit(1)
})

async function deleteEverything() {
    if (driverChild) {
        debug("deleting driver")
        await killAll(driverChild)
        debug("deleted driver")
    }

    debug("deleting server")
    try {
        const child = execa('docker-compose', ['down'],
            {
                all: true,
            }
        )
        child.all.pipe(process.stdout)
        await child
    } catch (e) {
        console.log(e)
    }

    debug("deleted server")
    console.log("cleanup")
}

async function poll(url, expectedErrorCode = null) {
    for (let i = 0; i < 240; i++) {
        try {
            debug("getting...")
            await axios.get(url)
            debug("success! the server is up")
            return true
        } catch (e) {
            if (e.code) {
                debug(e.code)
            } else if (e?.response?.statusText) {
                if (e.response.status === expectedErrorCode) {
                    debug("success! the server is up")
                    return true
                }
                debug(e.response.statusText)
            } else {
                debug(e)
            }
            await sleep(1000)
        }
        debug("looping")
    }
    throw new Error("No server found")
}

(async () => {
    axios.defaults.timeout = 500;

    if (process.platform === "win32") {
        var rl = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.on("SIGINT", function () {
            process.emit("SIGINT");
        });
    }

    process.on("SIGINT", async function () {
        await deleteEverything()
        process.exit();
    });

    const path = process.argv.slice(2).join(" ")
    if (!path) throw ("no path given for mocha")

    const child = execa('docker-compose', ['up', '--build'],
        {
            all: true,
        }
    )
    child.all.pipe(process.stdout)
    await poll("http://localhost:8080/status")

    driverChild = execa('./node_modules/.bin/geckodriver',
        {
            all: true,
        }
    )
    await poll("http://localhost:4444", 405)

    console.log("starting main process...")
    testChild = execa(
        'mocha',
        [
            "--color",
            "--timeout", "30000",
            "--full-trace", "--recursive",
            "--exclude", "test/helpers/**/*"
        ].concat(
            process.argv.slice(2)
        ),
        {
            all: true,
        }
    )
    testChild.all.pipe(process.stdout)

    console.log("main process running...")

    try {
        await testChild
    } catch (_e) {
        // console.error(e)
    }
    await deleteEverything()
    process.exit(testChild.exitCode)
})().catch(async (e) => {
    await deleteEverything()
    console.error(e)
    process.exit(1)
})