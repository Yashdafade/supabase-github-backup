import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';
import config from '../backup.config.js';
import { decrypt } from './crypto.js';

// Load env variables
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

const backupPath = process.argv[2];
const targetTable = process.argv[3];

if (!backupPath) {
  console.error('❌ Error: Please specify the backup directory to restore. Example:');
  console.error('   node scripts/restore.js backups/17-06-2026_08-17-PM');
  console.error('   To restore a single table, add the table name:');
  console.error('   node scripts/restore.js backups/17-06-2026_08-17-PM users');
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

console.log(`🚀 Starting restore from: ${backupPath}`);

// Map to store old user UUID -> new user UUID mapping
const userIdMap = {};

// 1. Restore Auth Users
const authUsersEncFile = join(backupPath, 'auth_users.json.enc');
const authUsersFile = join(backupPath, 'auth_users.json');

let users = null;
if (existsSync(authUsersEncFile)) {
  console.log('👥 Decrypting and parsing auth users...');
  const encryptedContent = readFileSync(authUsersEncFile, 'utf-8');
  users = JSON.parse(decrypt(encryptedContent, backupEncryptionKey));
} else if (existsSync(authUsersFile)) {
  console.log('👥 Parsing unencrypted auth users...');
  users = JSON.parse(readFileSync(authUsersFile, 'utf-8'));
}

if (users) {
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
      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === user.email);
      
      if (existingUser) {
        console.log(`   ⚠️ User with email ${user.email} already exists. Mapping existing ID.`);
        userIdMap[user.id] = existingUser.id;
      } else {
        console.log(`   Creating user: ${user.email}`);
        // Generate temporary password or use a fallback
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

// Order of tables to restore to prevent Foreign Key constraints issues
let tablesOrder = config.tables || [];

if (targetTable) {
  tablesOrder = [targetTable];
  console.log(`🎯 Restoring ONLY target table: ${targetTable}`);
}

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

// 2. Restore each table
for (const table of tablesOrder) {
  const tableEncFile = join(backupPath, `${table}.json.enc`);
  const tableFile = join(backupPath, `${table}.json`);
  
  let rawData = null;
  if (existsSync(tableEncFile)) {
    console.log(`📥 Decrypting and restoring table: ${table}...`);
    const encryptedContent = readFileSync(tableEncFile, 'utf-8');
    rawData = JSON.parse(decrypt(encryptedContent, backupEncryptionKey));
  } else if (existsSync(tableFile)) {
    console.log(`📥 Restoring unencrypted table: ${table}...`);
    rawData = JSON.parse(readFileSync(tableFile, 'utf-8'));
  } else {
    console.log(`⚠️ Skip table: ${table} (backup file not found)`);
    continue;
  }
  
  // Map foreign keys for auth users
  const mappedData = rawData.map(row => mapUserIds(row));
  
  if (mappedData.length === 0) {
    console.log(`   ✅ Table ${table} is empty.`);
    continue;
  }
  
  // Upsert rows into Supabase. Upsert avoids primary key conflicts if data is partially there.
  const { error } = await supabase.from(table).upsert(mappedData);
  if (error) {
    console.error(`   ❌ Failed to restore table ${table}:`, error.message);
  } else {
    console.log(`   ✅ Restored ${table}: ${mappedData.length} rows`);
  }
}

console.log('\n🎉 Restore process completed successfully!\n');
