const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { sendDueReports } = require('../services/monthlyReport');

const flag = (name) => process.argv.includes(`--${name}`);
const value = (name) => {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};

const run = async () => {
  const dryRun = flag('dry');
  const force = flag('force');
  const onlyUser = value('user');
  const overrideTo = value('to');
  const asOf = value('as-of') ? new Date(value('as-of')) : new Date();

  if (Number.isNaN(asOf.getTime())) {
    console.error('--as-of must be a date, e.g. --as-of=2026-10-01');
    process.exit(1);
  }

  await connectDB();
  console.log(`${dryRun ? 'Previewing' : 'Sending'} monthly reports as of ${asOf.toISOString()}${force ? ' (force)' : ''}${onlyUser ? ` for user ${onlyUser}` : ''}${overrideTo ? ` -> ${overrideTo}` : ''}`);

  const sent = await sendDueReports(asOf, { dryRun, force, onlyUser, overrideTo });
  console.log(dryRun ? `${sent} report(s) would be sent` : `${sent} report(s) sent`);

  await mongoose.connection.close();
  process.exit(0);
};

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
