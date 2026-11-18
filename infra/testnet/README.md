# Test Lightning node

Alby Hub with its built-in Lightning node on Mutinynet, a Bitcoin test network whose coins have no value.
`npm run wallet` (from the repo root) starts and manages it; you don't need to run Docker yourself.

| Command | What it does |
| --- | --- |
| `npm run wallet` | Shows the checklist and sets up whatever is missing |
| `npm run wallet status` | Checklist and balances; changes nothing |
| `npm run wallet channel -- --sats 250000` | Adds another test channel (more room to pay and be paid) |
| `npm run wallet stop` | Stops the node; your wallets and coins stay |
| `npm run wallet remove` | Deletes the node and its coins, after asking |

The dashboard is at http://127.0.0.1:8082, reachable only from your computer. Its password is generated
for your machine and saved as `KODI_HUB_PASSWORD` in `.env.local`; `npm run wallet status` prints it.

## Why a channel

A Lightning node can only receive through a channel where the other side holds coins. The Mutinynet faucet
opens one to your node after a GitHub sign-in and moves half of it to your side, so the same node can also
pay out. Kodi asks for a small channel (100,000 sats) by default. The faucet allows up to 1,000,000 sats a
day per account, so add more with `npm run wallet channel` whenever you need room.
