// backup.config.js
// Configure this file for your Supabase project.
// List all tables you want to back up.
// Auth users are always backed up automatically.

export default {
  // Your Supabase table names to back up, listed in restore/dependency order (parents first)
  // Use ['*'] to back up all public database tables.
  tables: [
    'analyses'
  ],

  // Database tables to exclude from backup
  excludeTables: [
    // 'some_private_table'
  ],

  // Timezone for backup folder timestamps
  // Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
  timezone: 'Asia/Kolkata',

  // Backup folder inside the repo
  backupDir: 'backups',

  // Your Supabase storage bucket names to back up
  // Use ['*'] to back up all storage buckets.
  buckets: [
    'Gones',
    // add all your storage buckets here
  ],

  // Storage buckets to exclude from backup
  excludeBuckets: [
    // 'temp-files'
  ],
};
