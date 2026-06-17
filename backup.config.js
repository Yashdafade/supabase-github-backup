// backup.config.js
// Configure this file for your Supabase project.
// List all tables you want to back up.
// Auth users are always backed up automatically.

export default {
  // Your Supabase table names to back up, listed in restore/dependency order (parents first)
  tables: [
    'analyses'
  ],

  // Timezone for backup folder timestamps
  // Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
  timezone: 'Asia/Kolkata',

  // Backup folder inside the repo
  backupDir: 'backups',
};
