const path = require("path")
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = (env) => {
    return {
        mode: env.development ? "development" : "production",
        devtool: env.development ? "eval-cheap-module-source-map" : undefined,
        entry: {
            main: "./client/app.tsx",
            signIn: "./client/signIn.ts"
        },
        output: {
            path: path.join(process.cwd(), 'static'),
            filename: (pathData) => {
                return pathData.chunk.name === 'main' ? 'protected/js/main.js' : 'public/js/signIn.js'
            }
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"]
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    options: {
                        transpileOnly: true
                    }
                }
            ]
        },
        plugins: [new ForkTsCheckerWebpackPlugin()]
    }
}