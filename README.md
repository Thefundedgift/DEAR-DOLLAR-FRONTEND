# DEAR DOLLAR — Customer Frontend

Powered by **INTERNET ZONE**

Production-ready customer frontend for the DEAR DOLLAR marketplace. Built with Next.js, Tailwind CSS and shadcn/ui. Connects to the existing NestJS backend via REST API. Fully self-hostable — **no Vercel, Netlify, Firebase or Supabase dependency**.

## Features

- Customer auth: register/login with Indian mobile number + password (JWT + refresh tokens, no OTP)
- Dashboard: Money Wallet, Point Wallet ($Dollar), pending transactions, quick actions
- Add Money: UPI deposit flow (amount → UPI ID + QR code → pay → submit UTR → admin verification)
- Buy $Dollar: active listings, backend-calculated quotes, confirmation, pending approval
- Sell $Dollar: demand listings, backend-calculated expected amount, sell requests
- History: buy/sell orders, money & dollar transactions, deposits, withdrawals with status badges
- Bank details (masked) + withdrawals
- Notifications (deposit/buy/sell verified or rejected)
- Community links (Telegram/Discord) fetched dynamically from backend — hidden when disabled by Super Admin
- Mobile-first fintech UI with bottom navigation (Home, Buy, Sell, Wallet, Profile)

## Environment

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the NestJS backend (e.g. `https://api.yourdomain.com`). Local dev: `http://localhost:4000` |

> `NEXT_PUBLIC_API_URL` is baked in at **build time**. If you change it you must rebuild the Docker image.
>
> **Demo/mock mode**: if `NEXT_PUBLIC_API_URL` is not set, the app falls back to its internal `/api` mock backend (requires `MONGO_URL` + `DB_NAME`).

## Local Development

```bash
yarn install
yarn dev
# open http://localhost:3000
```

---

# HOSTINGER KVM VPS DEPLOYMENT

Deployment flow: **GitHub → Hostinger VPS → Docker → Customer Frontend → Nginx → HTTPS → yourdomain.com**

## 1. SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

## 2. Install Docker (Ubuntu)

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
docker --version
docker compose version
```

## 3. Clone the repository

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/customer-frontend.git
cd customer-frontend
```

## 4. Create .env

```bash
cp .env.example .env
nano .env
# set: NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## 5. Build & start with Docker

```bash
docker compose up -d --build
```

Check it is running:

```bash
docker ps
curl http://localhost:3000
```

## 6. Install & configure Nginx reverse proxy

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/yourdomain.com
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Point your domain's **A record** to your VPS IP in your DNS panel (Hostinger hPanel → DNS).

## 7. SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo certbot renew --dry-run
```

Your site is now live at `https://yourdomain.com`.

## 8. Restart / Stop

```bash
docker compose restart          # restart
docker compose down             # stop
docker compose up -d --build    # rebuild + start
```

## 9. Logs

```bash
docker compose logs -f                    # follow logs
docker logs deardollar-customer-frontend  # container logs
sudo tail -f /var/log/nginx/access.log    # nginx access
sudo tail -f /var/log/nginx/error.log     # nginx errors
```

## 10. Update from GitHub

```bash
cd /opt/customer-frontend
git pull origin main
docker compose up -d --build
```

---

## Security Notes

- No JWT signing secrets or backend credentials in the frontend
- All financial calculations are performed by the backend (quotes, balances)
- Wallet balances are always fetched from the backend, never mutated locally
- Payments are never shown as successful until the backend confirms them
- Sensitive bank details are masked by the backend
- Protected routes require an authenticated session; access tokens auto-refresh
