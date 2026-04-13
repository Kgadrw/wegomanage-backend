# Backend (wegomanage)

Simple Express + TypeScript API to support the Vite frontend.

## Run (dev)

```bash
cd backend
npm install
cp .env.example .env
npm run db:seed
npm run dev
```

## Endpoints

- `GET /health`
- `GET /api/config`
- `PUT /api/settings/usd-to-frw-rate`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/subscriptions`
- `POST /api/subscriptions`
- `PUT /api/subscriptions/:id`
- `DELETE /api/subscriptions/:id`
- `GET /api/rent-records`
- `POST /api/rent-records`
- `PUT /api/rent-records/:id`
- `DELETE /api/rent-records/:id`
- `GET /api/reminders`
- `POST /api/reminders`
- `PUT /api/reminders/:id`
- `DELETE /api/reminders/:id`
- `GET /api/activity`
- `GET /api/notifications`

