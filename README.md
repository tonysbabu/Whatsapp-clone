# WhatsApp clone

TypeScript monorepo: React client, Node/Express + Socket.io server, PostgreSQL.

## Run locally

```bash
cp server/.env.example server/.env
npm install
npm run db:up
npm run db:generate
npm run db:migrate
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:3001
- Health: `GET /health`
- Ready (DB): `GET /ready`

## Server API

Authenticated routes require `Authorization: Bearer <jwt>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login |
| GET | `/auth/me` | Current user |
| GET | `/users/search?q=` | Search users |
| GET | `/conversations` | List chats |
| POST | `/conversations/dm` | Open or create 1:1 |
| POST | `/conversations/groups` | Create group |
| GET | `/conversations/:id` | Chat details |
| GET | `/conversations/:id/messages` | History (`before` / `after`, `limit`) |
| POST | `/conversations/:id/messages` | Send (HTTP fallback, idempotent `clientMsgId`) |
| PATCH | `/conversations/:id` | Rename group (admin) |
| POST | `/conversations/:id/members` | Add member (admin) |
| DELETE | `/conversations/:id/members/:userId` | Remove / leave group |

Socket.io handshake: `auth.token`. Events: `message:send`, `message:ack`, `message:new`, `message:delete`, `message:deleted`, `typing:start` / `typing:stop`, `receipt:read`, `presence:update`, `conversation:join`, `conversation:updated`.
