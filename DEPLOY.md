# EasyRecruit ATS 3.0 — Deployment Guide
## Run Online So Anyone Can Use It (Data Stored & Persistent)

---

## Which Platform Should I Use?

| Platform | Free? | Sleep on idle? | Persistent DB | Best for |
|---|---|---|---|---|
| **Render** | ✅ Yes | Yes (free tier) | ✅ Yes (disk) | **Recommended — easiest** |
| **Railway** | ✅ $5 credit/mo | No | ✅ Yes (volume) | Best free always-on |
| **Fly.io** | ✅ Yes | No | ✅ Yes (volume) | Most reliable free |
| **Docker VPS** | ❌ ~$5/mo | No | ✅ Yes | Full control |

**Recommendation:** Start with **Render** (completely free, 5-minute setup). If you need the app to always be awake (no cold start), move to **Railway**.

---

## Option A — Render.com (Recommended, 100% Free)

### Step 1 — Push to GitHub
1. Create a free account at [github.com](https://github.com)
2. Create a **new repository** (e.g. `easyrecruit-ats`) — set it to **Private** if you want
3. Upload all the project files into the repository

   **Easiest way using GitHub website:**
   - Click "uploading an existing file"
   - Drag and drop all files from the `EasyRecruit3.0_v9` folder
   - Click "Commit changes"

   **Or using Git on your computer:**
   ```bash
   cd EasyRecruit3.0_v9
   git init
   git add .
   git commit -m "Initial deploy"
   git remote add origin https://github.com/YOUR_USERNAME/easyrecruit-ats.git
   git push -u origin main
   ```

### Step 2 — Deploy on Render
1. Go to [render.com](https://render.com) → Sign up free (use GitHub login)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account → select your `easyrecruit-ats` repository
4. Fill in the form:

   | Field | Value |
   |---|---|
   | **Name** | `easyrecruit-ats` |
   | **Region** | Singapore (closest to India) |
   | **Branch** | `main` |
   | **Runtime** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt && python -m spacy download en_core_web_sm` |
   | **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
   | **Plan** | Free |

5. Scroll down to **"Environment Variables"** → click **"Add Environment Variable"**:

   | Key | Value |
   |---|---|
   | `SECRET_KEY` | (click "Generate" or type any long random string) |
   | `DEBUG` | `false` |
   | `DATABASE_PATH` | `/app/app/data/easyrecruit.db` |
   | `LOG_LEVEL` | `INFO` |

6. Scroll to **"Disks"** → click **"Add Disk"**:

   | Field | Value |
   |---|---|
   | **Name** | `easyrecruit-data` |
   | **Mount Path** | `/app/app/data` |
   | **Size** | `1 GB` |

   > ⚠️ This disk is critical — it stores your SQLite database with all users and analyses. Without it, data resets on every deploy.

7. Click **"Create Web Service"**

### Step 3 — Wait for Build (~5–8 minutes)
Render installs Python packages (spaCy + sentence-transformers are large). Watch the logs. When you see:
```
EasyRecruit ATS 3.0  —  Starting up
Database ready.
```
Your app is live!

### Step 4 — Your Live URL
Render gives you a URL like: `https://easyrecruit-ats.onrender.com`

Share this with anyone — they can register and use it from any device.

### ⚠️ Free Tier Limitation
On the free tier, Render **sleeps the app after 15 minutes of inactivity**. The first person to visit after a sleep period will wait ~30–60 seconds for it to wake up. If you want it always-on, upgrade to the "Starter" plan ($7/month) or use Railway below.

---

## Option B — Railway.app (Free $5 credit/month, No Sleep)

1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"** → select your repo
3. Railway auto-detects the `Dockerfile` and builds it
4. Go to **Variables** tab → add:
   - `SECRET_KEY` = any long random string
   - `DATABASE_PATH` = `/data/easyrecruit.db`
   - `DEBUG` = `false`
5. Go to **Volumes** tab → add a volume:
   - Mount path: `/data`
6. Go to **Settings** → **Domains** → click "Generate Domain"

Your app is live at `https://your-app.railway.app`

The $5 free credit covers ~500 hours/month — enough for a small team.

---

## Option C — Docker on a VPS (~$5/month, Full Control)

If you want complete control and guaranteed uptime, rent a cheap server:
- **DigitalOcean Droplet** — $4/month (1 GB RAM)
- **Hetzner Cloud** — €3.29/month (best value in India region)
- **AWS Lightsail** — $3.50/month

### Setup on your VPS:
```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Clone your repo
git clone https://github.com/YOUR_USERNAME/easyrecruit-ats.git
cd easyrecruit-ats

# 3. Set your secret key
echo "SECRET_KEY=your-very-long-random-secret-key-here" > .env

# 4. Start the app
docker-compose up -d

# 5. View logs
docker-compose logs -f

# App runs at http://YOUR_SERVER_IP:8001
```

### Make it available at a domain name (optional):
```bash
# Install nginx
sudo apt install nginx

# Create config
sudo nano /etc/nginx/sites-available/easyrecruit
```
Paste:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/easyrecruit /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Free SSL certificate
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Data Storage & Persistence

### Where is user data stored?
All data lives in a **SQLite database** at the path set by `DATABASE_PATH`:
- Users, passwords (hashed), roles
- All resume analyses and scores
- Job descriptions
- Login history

### Is data safe across updates?
Yes — when you update and redeploy:
- **Render/Railway:** The persistent disk/volume is separate from the code. Redeploys never touch the database.
- **Docker VPS:** The `easyrecruit_data` Docker volume persists across container restarts and image rebuilds.

### How to back up the database?

**On Render:** Go to your service → "Disks" → Download the file, or SSH in:
```bash
# Download using render shell
cat /app/app/data/easyrecruit.db > backup.db
```

**On Docker VPS:**
```bash
docker cp easyrecruit-ats-web-1:/app/app/data/easyrecruit.db ./backup_$(date +%Y%m%d).db
```

**Automated daily backup (VPS):**
```bash
# Add to crontab: crontab -e
0 2 * * * docker cp easyrecruit-ats-web-1:/app/app/data/easyrecruit.db /home/user/backups/easyrecruit_$(date +\%Y\%m\%d).db
```

---

## Creating the First Admin Account

After deploying, the first user you register gets `recruiter` role by default.
To make yourself an admin, either:

**Option 1 — Register and promote via DB:**
```bash
# On Render shell / Railway shell / VPS:
sqlite3 /app/app/data/easyrecruit.db \
  "UPDATE users SET role='admin' WHERE email='your@email.com';"
```

**Option 2 — Register with admin role via API (first time only):**
```bash
curl -X POST https://your-app.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Admin","email":"admin@yourcompany.com","username":"admin","password":"YourPass123","role":"admin"}'
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | ✅ Yes | weak default | JWT signing key — **must change in prod** |
| `DATABASE_PATH` | ✅ Yes | `app/data/easyrecruit.db` | Full path to SQLite file |
| `DEBUG` | No | `false` | Enable API docs at `/api/docs` |
| `PORT` | No | `8001` | HTTP port (Render/Railway inject this) |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `1440` | JWT lifetime (1440 = 24 hours) |
| `CORS_ORIGINS` | No | `*` | Restrict to your domain in production |

---

## Troubleshooting

**Build fails with "No module named spacy"**
→ Make sure the build command includes `python -m spacy download en_core_web_sm`

**App starts but database errors appear**
→ Check `DATABASE_PATH` env var and make sure the disk/volume is mounted at the right path

**"Internal server error" on analysis**
→ The spaCy model may not have downloaded. Check the build logs for the spacy download step.

**App sleeps on Render free tier**
→ Use [cron-job.org](https://cron-job.org) to ping `https://your-app.onrender.com/api/v1/health` every 14 minutes — this keeps it awake for free.

**Users can't register — "Email already registered"**
→ Normal behaviour. Direct them to the login tab.
