import {readFileSync} from 'node:fs';
// Execute the exact administrative DO block, not a test reimplementation.
const sql=readFileSync('scripts/sql/recover-staging-owner.sql','utf8').match(/do \$alys_recovery\$[\s\S]*?\$alys_recovery\$;/i)?.[0];
if(!sql)throw new Error('Recovery block missing');
process.stdout.write("select set_config('alys.test.owner_recovery_sql', '"+sql.replaceAll("'","''")+"', false);\n"+readFileSync('supabase/tests/staging_owner_recovery.sql','utf8'));
