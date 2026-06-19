# 🛡️ Open-source Supabase Disaster Recovery Toolkit

<p align="center">
  <strong>Automated daily off-site backup and recovery for Supabase projects without paying for Pro backup features.</strong>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-blue.svg" alt="Node.js version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

---

## 🚀 Why this exists (and why you should use it)

Supabase is an incredible backend platform, but automatic scheduled backups are locked behind the **Pro tier ($25/month or ~₹2,500/month)**. If you run staging environments, client proof-of-concepts, auxiliary applications, or hobby projects, paying for the Pro tier solely to secure database snapshots is inefficient.

The **Supabase Disaster Recovery Toolkit** provides a robust, off-site backup and recovery solution for projects that don't want to pay for Pro backup features. It automatically packages your database records and authentication schema into version-controlled JSON snapshots stored directly in your private Git repository.

### 📊 Feature Comparison: Supabase Native Backups vs. DR Toolkit

| Feature | Supabase Native Backups (Pro+) | Supabase DR Toolkit (Free) |
| :--- | :---: | :---: |
| **Required Tier** | 🔴 Pro plan ($25+/mo) | 🟢 Works on all tiers (including Free) |
| **Storage Destination** | Supabase Internal | 🟢 Your Private Git Repository (Off-site) |
| **Auth Schema Backup** | 🟡 Internal Only | 🟢 Full JSON Export (IDs, emails, metadata) |
| **Retention Policy** | 7 to 30 Days | 🟢 Infinite (Stored in your Git commit history) |
| **Trigger Execution** | Automated | 🟢 Automated via GitHub Actions + Manual trigger |
| **Relational Restoration** | Requires manual SQL/import | 🟢 Automated restoration with **UUID Remapping** |

---

## ⚡ Superpowers & Features

- **📦 Fully Automated:** Runs silently in the background at 1 AM UTC every day via GitHub Actions. Zero server maintenance, zero cost.
- **🗄️ Storage Buckets Backup:** Recursively lists, downloads, and encrypts all files and folder layouts from your configured Supabase Storage buckets.
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

### Step 2: Configure Your Tables & Buckets
Open [backup.config.js](file:///G:/supabase-github-backup/backup.config.js) in the root of the project and specify your database tables and storage buckets:
```js
export default {
  // Tables to back up. Listed in restore/dependency order (parents first).
  // Use ['*'] or leave empty to auto-discover and back up all public database tables.
  tables: [
    'users',
    'posts',
    'orders',
  ],

  // Database tables to exclude from backup (applied to auto-discovered or specified tables)
  excludeTables: [
    // 'some_private_table'
  ],

  // Storage buckets to back up.
  // Use ['*'] to auto-discover and back up all storage buckets.
  buckets: [
    'documents',
    // add all your storage buckets here
  ],

  // Storage buckets to exclude from backup (applied to auto-discovered or specified buckets)
  excludeBuckets: [
    // 'temp-files'
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
3. **Backup Encryption Key:**
   - Generate a strong, secure 32-character hexadecimal key. You can generate one instantly using one of these commands:
     - **OpenSSL:** `openssl rand -hex 32`
     - **Node.js:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Copy this generated string.

### Step 4: Add GitHub Secrets
In your new repository, go to **Settings** → **Secrets and variables** → **Actions** and add these secrets:
- `SUPABASE_URL` : `https://your-project-id.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` : `your-service-role-key`
- `BACKUP_GITHUB_TOKEN` : `your-copied-github-pat`
- `BACKUP_ENCRYPTION_KEY` : `your-generated-encryption-key` (keep this safe to decrypt/restore your backups)

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
BACKUP_ENCRYPTION_KEY=your-custom-secure-passphrase-here
```

### Manual Backup Command
```bash
npm run backup
```

### Manual Restore Command
```bash
# Restore all tables, users, and storage from an encrypted archive
npm run restore backups/18-06-2026_01-00-AM.tar.gz.enc

# Restore only a single table (e.g., users)
npm run restore backups/18-06-2026_01-00-AM.tar.gz.enc users
```

---

## 📁 Backup Archive Anatomy

Each backup creates a single compressed, encrypted archive file using standard `AES-256-CBC`:
```
backups/
  18-06-2026_01-00-AM.tar.gz.enc  ← Encrypted compressed archive (contains database tables, auth schema, and storage buckets)
```

---

## 🔄 Restore Mechanics & UUID Mapping

When you run `npm run restore <path>`, the script performs these operations:
1. **Decrypts & Decompresses Archive:** Reads the target encrypted archive file, decrypts it using the mandatory `BACKUP_ENCRYPTION_KEY`, and decompresses the Gzip payload in memory.
2. **Rebuilds Auth Schema:** Reads the auth users metadata and creates user profiles on the target Supabase project.
3. **Dynamic ID Mapping:** Recreated users get new UUIDs from Supabase. The script logs these mappings in memory (`old-uuid` -> `new-uuid`).
4. **Cascades Foreign Keys:** While inserting rows into your tables (e.g. `posts`, `orders`), the script swaps out old user references in common fields (`id`, `user_id`, `owner_id`, `created_by`, `updated_by`) with the new UUIDs to ensure foreign key constraints succeed.
5. **Restores Storage Buckets:** Automatically creates missing buckets on the target project, decodes base64-encoded files in the archive back into binary buffers, and uploads them using upsert.
6. **Temporary Password:** Restored users are initialized with a temporary password (`ChangeMePermanent123!`) and will need to request a password reset to sign back in.

---

## 🛡️ Security Best Practices

- **Encryption Key Passphrase:** Keep your `BACKUP_ENCRYPTION_KEY` safe. If you lose this key, you will never be able to decrypt or restore your backups.
- **Service Role Secret:** Never commit your `.env` file to your codebase.
- **Repository Visibility:** Make absolute sure the repository is **Private**.
- **Auth Passwords:** Passwords cannot be exported from Supabase's authentication service. Restoring accounts resets passwords to a placeholder.

---

## ⚠️ Current Limitations

- **Large Storage Files:** Backing up extremely large storage files (several hundred megabytes) might cause memory issues or trigger timeout limits on the GitHub Actions runner.
- **Scale Limits:** For massive tables (over 100,000 rows), direct querying without custom pagination might timeout or run out of memory.
- **Password reset requirement:** Restored users must reset their password on their first sign-in.

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

License: [MIT](LICENSE)


