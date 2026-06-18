import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';
import { gunzipSync } from 'zlib';
import config from '../backup.config.js';
import { decrypt } from './crypto.js';

// Load env variables manually if it exists (for local testing)
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

const backupFilePath = process.argv[2];
const targetTable = process.argv[3];

if (!backupFilePath) {
  console.error('❌ Error: Please specify the backup file to restore. Example:');
  console.error('   node scripts/restore.js backups/17-06-2026_08-17-PM.tar.gz.enc');
  console.error('   To restore a single table, add the table name:');
  console.error('   node scripts/restore.js backups/17-06-2026_08-17-PM.tar.gz.enc users');
  process.exit(1);
}

if (!existsSync(backupFilePath)) {
  console.error(`❌ Error: Backup file not found at path: ${backupFilePath}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

console.log(`🚀 Starting restore from file: ${backupFilePath}`);

// 1. Read, Decrypt (if encrypted), and Decompress the archive
const fileBuffer = readFileSync(backupFilePath);
let decompressed = null;

if (backupFilePath.endsWith('.enc')) {
  console.log('🔒 Decrypting archive (AES-256)...');
  const decrypted = decrypt(fileBuffer, backupEncryptionKey);
  console.log('📦 Decompressing archive...');
  decompressed = gunzipSync(decrypted);
} else {
  console.error('❌ Error: Only encrypted backup archives (.enc) are supported for restore.');
  process.exit(1);
}

const archive = JSON.parse(decompressed.toString('utf-8'));
console.log(`   ✅ Archive timestamp: ${archive.timestamp}`);

const userIdMap = {};

// 2. Restore Auth Users
const users = archive.auth_users || [];
if (users.length > 0) {
  if (targetTable) {
    console.log('👥 Mapping existing auth users in memory (skipping user creation)...');
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    if (existingUsers?.users) {
      for (const user of users) {
        const existingUser = existingUsers.users.find(u => u.email === user.email);
        if (existingUser) {
          userIdMap[user.id] = existingUser.id;
        }
      }
    }
  } else {
    console.log('👥 Restoring auth users...');
    for (const user of users) {
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === user.email);
      
      if (existingUser) {
        console.log(`   ⚠️ User with email ${user.email} already exists. Mapping existing ID.`);
        userIdMap[user.id] = existingUser.id;
      } else {
        console.log(`   Creating user: ${user.email}`);
        const tempPassword = 'ChangeMePermanent123!'; 
        const { data: created, error } = await supabase.auth.admin.createUser({
          email: user.email,
          email_confirm: true,
          password: tempPassword,
          user_metadata: user.raw_user_meta_data || {},
        });
        
        if (error) {
          console.error(`   ❌ Failed to create user ${user.email}:`, error.message);
        } else if (created?.user) {
          userIdMap[user.id] = created.user.id;
          console.log(`   ✅ Created user: ${user.email} (mapped ${user.id} -> ${created.user.id})`);
        }
      }
    }
  }
}

// 3. Restore Database Tables
let tablesOrder = config.tables || [];
const excludeTables = config.excludeTables || [];

if (targetTable) {
  tablesOrder = [targetTable];
  console.log(`🎯 Restoring ONLY target table: ${targetTable}`);
} else if (tablesOrder.includes('*') || tablesOrder.length === 0) {
  console.log('🔍 Auto-discovering tables to restore from backup archive...');
  tablesOrder = Object.keys(archive.tables || {});
}

tablesOrder = tablesOrder.filter(t => t !== '*' && !excludeTables.includes(t));

// Helper function to map old user IDs to new user IDs in any fields
function mapUserIds(row) {
  const fieldsToMap = ['id', 'user_id', 'doctor_id', 'created_by'];
  for (const field of fieldsToMap) {
    if (row[field] && userIdMap[row[field]]) {
      const oldVal = row[field];
      row[field] = userIdMap[row[field]];
      console.log(`   🔄 Mapped field [${field}]: ${oldVal} -> ${row[field]}`);
    }
  }
  return row;
}

for (const table of tablesOrder) {
  const rawData = archive.tables[table];
  if (!rawData) {
    console.log(`⚠️ Skip table: ${table} (not found in backup archive)`);
    continue;
  }
  
  console.log(`📥 Restoring table: ${table}...`);
  const mappedData = rawData.map(row => mapUserIds(row));
  
  if (mappedData.length === 0) {
    console.log(`   ✅ Table ${table} is empty.`);
    continue;
  }
  
  const { error } = await supabase.from(table).upsert(mappedData);
  if (error) {
    console.error(`   ❌ Failed to restore table ${table}:`, error.message);
  } else {
    console.log(`   ✅ Restored ${table}: ${mappedData.length} rows`);
  }
}

// 4. Restore Storage Buckets
const storageData = archive.storage || {};
const storageKeys = Object.keys(storageData);

if (storageKeys.length > 0) {
  console.log('\n📤 Restoring storage buckets...');
  try {
    const excludeBuckets = config.excludeBuckets || [];
    
    // Group files by bucket
    const bucketGroups = {};
    for (const key of storageKeys) {
      const firstSlash = key.indexOf('/');
      const bucketName = key.substring(0, firstSlash);
      const destFile = key.substring(firstSlash + 1);
      
      if (excludeBuckets.includes(bucketName)) continue;
      
      if (!bucketGroups[bucketName]) {
        bucketGroups[bucketName] = [];
      }
      bucketGroups[bucketName].push({ key, destFile });
    }

    const { data: existingBuckets } = await supabase.storage.listBuckets();

    for (const bucketName of Object.keys(bucketGroups)) {
      console.log(`📂 Restoring bucket: ${bucketName}...`);
      
      // Ensure bucket exists on remote
      const bucketExists = existingBuckets?.some(b => b.name === bucketName);
      if (!bucketExists) {
        console.log(`   ⚠️ Bucket "${bucketName}" does not exist. Creating it...`);
        const { error: createError } = await supabase.storage.createBucket(bucketName, { public: false });
        if (createError) {
          console.error(`   ❌ Failed to create bucket "${bucketName}":`, createError.message);
          continue;
        }
        console.log(`   ✅ Created bucket: ${bucketName}`);
      }

      for (const fileItem of bucketGroups[bucketName]) {
        console.log(`   📥 Uploading: ${fileItem.destFile}...`);
        const fileBuffer = Buffer.from(storageData[fileItem.key], 'base64');

        const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileItem.destFile, fileBuffer, {
          upsert: true
        });

        if (uploadError) {
          console.error(`   ❌ Failed to upload ${fileItem.destFile} to bucket ${bucketName}:`, uploadError.message);
        } else {
          console.log(`   ✅ Uploaded: ${bucketName}/${fileItem.destFile}`);
        }
      }
      console.log(`   ✅ Completed restoration for bucket: ${bucketName}`);
    }
  } catch (err) {
    console.error('❌ Failed to restore storage buckets:', err.message || err);
  }
}

console.log('\n🎉 Restore process completed successfully!\n');
