module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    rules: {
        "quotes": [1, "double"],
    },
    plugins: [
        "@typescript-eslint",
    ],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:react/recommended"
    ],
    settings: {
        "react": {
            "version": "detect"
        }
    }
};