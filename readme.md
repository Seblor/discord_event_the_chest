# The Chest

## Notice

This is just a simple project made in a couple days, to be executed only once, so it's far from perfect. If you find any bugs, please keep them to yourself (or fork the project) ;)

This readme is also far from perfect, but it's enough to get you started.

## Installation

### Requirements

- [Node.js](https://nodejs.org/en/)
- [Typescript](https://www.typescriptlang.org/)
- [pm2](https://www.npmjs.com/package/pm2)

### Install dependencies

Run the following commands in the root of the project:

    npm install

### Configuration

Create a .env file with the following content:

```
DATABASE_URL="YOUR_DATABASE_URL"
DISCORD_TOKEN="YOUR_DISCORD_TOKEN"
```

### Create the database

Run the following command in the root of the project:

    npx prisma db push
    npx prisma generate

### Run

Run the following command in the root of the project:

    pm2 start src/app.ts