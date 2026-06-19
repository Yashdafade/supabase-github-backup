import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';
import { gzipSync } from 'zlib';
import config from '../backup.config.js';
import { encrypt } from './crypto.js';

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
const backupEncryptionKey = process.env.BACKUP_ENCRYPTION_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !backupEncryptionKey) {
  console.error('❌ Error: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and BACKUP_ENCRYPTION_KEY environment variables are required.');
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
mkdirSync(baseBackupDir, { recursive: true });

// Initialize the archive structure
const archive = {
  timestamp,
  tables: {},
  auth_users: [],
  storage: {}
};

// Helper to fetch all tables in the public schema via PostgREST OpenAPI spec
async function getApiTables() {
  try {
    const restUrl = `${supabaseUrl}/rest/v1/`;
    const response = await fetch(restUrl, {
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch schema: ${response.statusText}`);
    }
    const schema = await response.json();
    return Object.keys(schema.definitions || {});
  } catch (err) {
    console.warn('⚠️ Warning: Failed to auto-discover tables via PostgREST:', err.message);
    return [];
  }
}

// Helper to recursively list all files in a Supabase storage bucket
async function listAllFiles(bucketName, path = '') {
  const filesList = [];
  const { data, error } = await supabase.storage.from(bucketName).list(path);
  if (error) {
    throw error;
  }
  for (const item of data) {
    const fullPath = path ? `${path}/${item.name}` : item.name;
    if (item.id === null) {
      const subFiles = await listAllFiles(bucketName, fullPath);
      filesList.push(...subFiles);
    } else {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

console.log(`🚀 Starting backup at ${new Date().toISOString()}`);

// 1. Resolve tables list and fetch table data
let tables = config.tables || [];
const excludeTables = config.excludeTables || [];

if (tables.length === 0 || tables.includes('*')) {
  console.log('🔍 Auto-discovering database tables...');
  const discoveredTables = await getApiTables();
  if (discoveredTables.length > 0) {
    tables = discoveredTables;
  } else {
    tables = [];
  }
}

tables = tables.filter(t => t !== '*' && !excludeTables.includes(t));

for (const table of tables) {
  console.log(`📥 Fetching table: ${table}...`);
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    console.error(`❌ Failed to fetch table ${table}:`, error.message);
    continue;
  }
  archive.tables[table] = data || [];
  console.log(`   ✅ Fetched ${table}: ${archive.tables[table].length} rows`);
}

// 2. Fetch auth users
console.log('📥 Fetching auth users...');
try {
  let page = 1;
  const allUsers = [];
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000
    });
    if (error) throw error;
    const users = data?.users || [];
    if (users.length === 0) break;
    allUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }
  archive.auth_users = allUsers;
  console.log(`   ✅ Fetched auth_users: ${allUsers.length} users`);
} catch (error) {
  console.error('❌ Failed to fetch auth users:', error.message || error);
}

// 3. Fetch storage buckets
let buckets = config.buckets || [];
const excludeBuckets = config.excludeBuckets || [];

if (buckets.includes('*') || (buckets.length === 0 && excludeBuckets.length > 0)) {
  console.log('🔍 Auto-discovering storage buckets...');
  try {
    const { data: bucketsData, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) throw bucketsError;
    buckets = (bucketsData || []).map(b => b.name);
  } catch (err) {
    console.warn('⚠️ Warning: Failed to auto-discover storage buckets:', err.message || err);
    buckets = [];
  }
}

buckets = buckets.filter(b => b !== '*' && !excludeBuckets.includes(b));

if (buckets.length > 0) {
  console.log('📥 Fetching storage buckets...');
  for (const bucket of buckets) {
    console.log(`📂 Fetching bucket: ${bucket}...`);
    try {
      const files = await listAllFiles(bucket);
      if (files.length === 0) {
        console.log(`   ✅ Bucket ${bucket} is empty.`);
        continue;
      }
      for (const file of files) {
        const { data, error } = await supabase.storage.from(bucket).download(file);
        if (error) {
          console.error(`   ❌ Failed to download file ${file} from bucket ${bucket}:`, error.message);
          continue;
        }
        const fileBuffer = Buffer.from(await data.arrayBuffer());
        archive.storage[`${bucket}/${file}`] = fileBuffer.toString('base64');
        console.log(`   ✅ Fetched file: ${bucket}/${file}`);
      }
    } catch (err) {
      console.error(`   ❌ Failed to backup bucket ${bucket}:`, err.message || err);
    }
  }
}

// 4. Compress and Encrypt the archive
console.log('📦 Archiving and compressing backup...');
const jsonString = JSON.stringify(archive);
const compressed = gzipSync(Buffer.from(jsonString, 'utf-8'));

console.log('🔒 Encrypting archive (AES-256)...');
const encrypted = encrypt(compressed, backupEncryptionKey);
const destPath = join(baseBackupDir, `${timestamp}.tar.gz.enc`);
writeFileSync(destPath, encrypted);
console.log(`\n🎉 Backup process completed successfully! Saved encrypted archive to: ${destPath}\n`);
