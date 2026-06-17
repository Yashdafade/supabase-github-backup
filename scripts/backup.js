import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';
import config from '../backup.config.js';

// Load .env file manually if it exists (for local testing)
if (existsSync('.env')) {
  const envFile = readFileSync('.env', 'utf-8');
  envFile.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index !== -1) {
      const key = trimmed.slice(0, index).trim();
      const val = trimmed.slice(index + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  process.exit(1);
}

// Disable session persisting since we are executing a one-off backup script
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

// Generate timestamp in configured timezone
const timezone = config.timezone || 'Asia/Kolkata';
const now = new Date();
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const parts = formatter.formatToParts(now);
const day = parts.find(p => p.type === 'day').value;
const month = parts.find(p => p.type === 'month').value;
const year = parts.find(p => p.type === 'year').value;
const hoursStr = parts.find(p => p.type === 'hour').value.padStart(2, '0');
const minutes = parts.find(p => p.type === 'minute').value;
const ampm = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();

const timestamp = `${day}-${month}-${year}_${hoursStr}-${minutes}_${ampm}`;
const baseBackupDir = config.backupDir || 'backups';
const backupDir = join(baseBackupDir, timestamp);
mkdirSync(backupDir, { recursive: true });

const tables = config.tables || [];

console.log(`🚀 Starting backup at ${new Date().toISOString()}`);

// 1. Backup standard tables
for (const table of tables) {
  console.log(`📥 Backing up table: ${table}...`);
  // Retrieve all rows. For extremely large tables pagination would be required,
  // but for the scope of this database direct querying is efficient and safe.
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    console.error(`❌ Failed to backup ${table}:`, error.message);
    continue;
  }
  
  const filePath = join(backupDir, `${table}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`   ✅ Saved ${table}: ${data ? data.length : 0} rows`);
}

// 2. Backup authentication users
console.log('📥 Backing up auth users...');
try {
  let page = 1;
  const allUsers = [];
  
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000
    });
    
    if (error) {
      throw error;
    }
    
    const users = data?.users || [];
    if (users.length === 0) {
      break;
    }
    
    allUsers.push(...users);
    
    if (users.length < 1000) {
      break;
    }
    page++;
  }
  
  const authFilePath = join(backupDir, 'auth_users.json');
  writeFileSync(authFilePath, JSON.stringify(allUsers, null, 2));
  console.log(`   ✅ Saved auth_users: ${allUsers.length} users`);
} catch (error) {
  console.error('❌ Failed to backup auth users:', error.message || error);
}

console.log(`\n🎉 Backup process completed successfully! Saved to: ${backupDir}\n`);
