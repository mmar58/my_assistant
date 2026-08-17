import 'dotenv/config';
import { runMigrations } from './db.js';

runMigrations()
  .then(() => {
    console.log('Migration successful');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
