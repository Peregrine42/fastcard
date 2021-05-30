const { remote } = require('webdriverio')

let browser = null;

module.exports = {
	buildBrowser: async () => {
		if (browser) {
			return browser
		} else {
			browser = await remote({
				logLevel: 'warn',
				capabilities: {
					browserName: 'firefox',
					"moz:firefoxOptions": {
						args: ['-headless']
					},
				},
			})

			return browser
		}
	}
}