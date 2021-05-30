# Setup

Install Python 3.8.
Install Node v14.17.0.
Install Postgres 12.
Install direnv.
Create a `fastcard` database in Postgres.

Create a copy of the `.envrc.example` file called `.envrc`. Fill in the appropriate environment variables.

Then, run:
```
direnv allow
npm install
pip install -r requirements.txt
```

# Test

```
npm test
```

See `package.json` for other testing commands.

# Start

```
npm start
```