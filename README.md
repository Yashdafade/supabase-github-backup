# 💸 supabase-github-backup

<p align="center">
  <strong>Free automated daily backups for any Supabase project — keep your data, version your history, and save up to ₹30,000/year (₹2,500/month) per project.</strong>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-blue.svg" alt="Node.js version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Saved-Over%20%E2%82%B925%2C000-green.svg" alt="Savings Badge">
</p>

---

## 🚀 The Pitch: Why this exists (and why you should use it)

If you build websites for clients or manage multiple products, you typically need to place them in separate organizations for billing isolation and access control. With **Supabase Pro priced at ₹2,500/month (₹30,000/year) per organization**, managing 8 client projects would run you **over ₹2.4 Lakhs a year** just to secure your data with Pro backups.

Even if you bundle multiple projects under a single Pro organization, Supabase charges **+$10/month (~₹1,000/month) for each additional project instance's compute**, on top of storage and database size overages. 

**`supabase-github-backup`** lets you confidently keep your projects on the Free tier and secure your data for **₹0/month**. It runs automatically via GitHub Actions, pushing time-stamped JSON snapshots directly into a private GitHub repository.

### 📊 The Comparison: Supabase Pro vs. This Tool

| Feature | Supabase Pro (₹2,500/mo) | `supabase-github-backup` (₹0/mo) |
| :--- | :---: | :---: |
| **Cost** | 🔴 **₹30,000 / year** | 🟢 **₹0 (100% Free)** |
| **Backup Destination** | Supabase Internal | 🟢 **Your own Private Git Repository** |
| **Auth Users Export** | 🟡 Restricted | 🟢 **Full (Emails, Profiles & Metadata)** |
| **Data Retention** | 7 Days | 🟢 **Infinite (Version-controlled history)** |
| **Setup Time** | 1 click | 🟡 **5 minutes (once)** |
| **Relational Restore** | Manual DB Import | 🟢 **Automatic (UUID Remapping included)** |

---

## ⚡ Superpowers & Features

- **📦 Fully Automated:** Runs silently in the background at 1 AM UTC every day via GitHub Actions. Zero server maintenance, zero cost.
- **👥 Auth User Recovery (The Secret Weapon):** Supabase's free tier and regular pg_dumps omit auth user profiles and metadata. We export the complete GoTrue schema users so you don't lose your user base.
- **🧬 Relational Restore with UUID Remapping:** Restoring users to a new project generates brand new UUIDs. Our restore script dynamically maps old user IDs to new IDs in subsequent database tables, preserving all your foreign key relationships.
- **📁 Git-as-a-Database Versioning:** Look back at your database states at any date in history using standard Git commits.

---

## ⚙️ How It Works

```
[Every Day at 1:00 AM UTC]
        │
        ▼
┌────────────────────────────────────────┐
│  GitHub Actions wakes up a runner      │
├────────────────────────────────────────┤
│  1. Installs Node.js & dependencies     │
│  2. Calls Supabase REST & Auth APIs    │
│  3. Formats & saves data to backups/   │
│  4. Commits & force-pushes snapshots   │
└────────────────────────────────────────┘
        │
        ▼
[Your Private GitHub Repo updated!]
```

---

## 🛠️ Prerequisites

- A **Supabase project** (Free tier is perfectly fine).
- A **GitHub account**.
- **Node.js ≥ 20** (for local testing/restoration).

---

## 🏁 Step-by-Step Launch Guide (Under 5 Minutes)

### Step 1: Clone this Repository
Click **"Use this template"** or **"Fork"** on GitHub to create your own copy.
> [!CAUTION]
> **You MUST make your repository PRIVATE.** Your backup files will contain real user emails, names, and metadata. Storing this in a public repository is a severe security risk.

### Step 2: Configure Your Tables
Open [backup.config.js](file:///G:/supabase-free-backup/backup.config.js) in the root of the project and specify your database tables in dependency order (parents before children):
```js
export default {
  tables: [
    'users',
    'posts',
    'orders',
  ],
  timezone: 'Asia/Kolkata', // Set your target timezone for directory labels
  backupDir: 'backups',
};
```

### Step 3: Gather API Keys
1. **Supabase Service Role Key:**
   - Go to your **Supabase Dashboard** → **Settings** → **API** → **service_role (secret)**.
   - ⚠️ *Do not use your anon key. The service role key is required to bypass Row Level Security (RLS).*
2. **GitHub Personal Access Token (PAT):**
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens).
   - Generate a new classic token named `supabase-backup-token` with the **`repo`** scope. Copy it.

### Step 4: Add GitHub Secrets
In your new repository, go to **Settings** → **Secrets and variables** → **Actions** and add these three secrets:
- `SUPABASE_URL` : `https://your-project-id.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` : `your-service-role-key`
- `BACKUP_GITHUB_TOKEN` : `your-copied-github-pat`

### Step 5: Test Trigger
Go to the **Actions** tab of your repo, select the **Daily Supabase Backup** workflow, and click **Run workflow**. Once completed, your repository will contain a fresh `backups/` snapshot!

---

## 💻 Local Testing & Manual Backup

```bash
# Clone the repository
git clone https://github.com/your-username/your-backup-repo.git
cd your-backup-repo

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

Edit your `.env` file with your credentials:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### Manual Backup Command
```bash
npm run backup
```

### Manual Restore Command
```bash
# Restore all tables and auth users
npm run restore backups/18-06-2026_01-00-AM

# Restore only a single table (e.g., users)
npm run restore backups/18-06-2026_01-00-AM users
```

---

## 📁 Backup Folder Anatomy

Every backup creates a neat, structured directory:
```
backups/
  18-06-2026_01-00-AM/
    users.json         ← Custom database table
    posts.json         ← Custom database table
    orders.json        ← Custom database table
    auth_users.json    ← Entire authentication schema exports (emails, metadata)
```

---

## 🔄 Restore Mechanics & UUID Mapping

When you run `npm run restore <path>`, the script performs these operations:
1. **Rebuilds Auth Schema:** Reads `auth_users.json` and creates user entries on the target Supabase project.
2. **Dynamic ID Mapping:** Recreated users get new UUIDs from Supabase. The script logs these mappings in memory (`old-uuid` -> `new-uuid`).
3. **Cascades Foreign Keys:** While inserting rows into your tables (e.g. `posts`, `orders`), the script swaps out old user references in common fields (`id`, `user_id`, `created_by`) with the new UUIDs to ensure foreign key constraints succeed.
4. **Temporary Password:** Restored users are initialized with a temporary password (`ChangeMePermanent123!`) and will need to request a password reset to sign back in.

---

## 🛡️ Security Best Practices

- **Service Role Secret:** Never commit your `.env` file to your codebase.
- **Repository Visibility:** Make absolute sure the repository is **Private**.
- **Auth Passwords:** Passwords cannot be exported from Supabase's authentication service. Restoring accounts resets passwords to a placeholder.

---

## ⚠️ Current Limitations

- **Supabase Storage:** Storage buckets containing media, images, or uploads are not backed up.
- **Scale Limits:** For massive tables (over 100,000 rows), direct querying without custom pagination might timeout or run out of memory.
- **Password reset requirement:** Restored users must reset their password on their first sign-in.

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

License: [MIT](LICENSE)


