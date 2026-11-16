/**
 * One-time: give users who signed up before the Nov 2026 pricing change the
 * difference between the old signup gift (100 points) and the new one (300),
 * so early users are not worse off than new ones.
 *
 * Why: requests are now charged at the real provider cost (about 12 points per
 * request instead of about 5), so an old 100-point gift buys far fewer requests.
 *
 * Safe to run more than once: each user is marked and only ever gets it once.
 * Only accounts created before --before (the time this change was deployed)
 * qualify, since newer accounts already got 300.
 * Dry run by default (prints how many users would get it). To apply:
 *   MONGODB_URI=... node scripts/grantSignupDifference.js --before=2026-11-17T10:00:00Z --apply
 */
const mongoose = require('mongoose');

const OLD_SIGNUP = 100;
const NEW_SIGNUP = 300;
const GRANT = NEW_SIGNUP - OLD_SIGNUP;
const MARKER = 'signupDifferenceGrantedAt';

async function main() {
  const uri = process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim();
  if (!uri) throw new Error('Set MONGODB_URI');
  const apply = process.argv.includes('--apply');
  const beforeArg = (process.argv.find((a) => a.startsWith('--before=')) || '').slice('--before='.length);
  const before = new Date(beforeArg);
  if (!beforeArg || Number.isNaN(before.getTime())) throw new Error('Pass --before=<ISO time the pricing change was deployed>');
  await mongoose.connect(uri);
  const users = mongoose.connection.collection('users');
  const filter = {
    [MARKER]: { $exists: false },
    _id: { $lt: mongoose.Types.ObjectId.createFromTime(Math.floor(before.getTime() / 1000)) }
  };
  const count = await users.countDocuments(filter);
  if (!apply) {
    console.log(`Dry run: ${count} users would get +${GRANT} points. Re-run with --apply.`);
  } else {
    const res = await users.updateMany(filter, { $inc: { aiCredits: GRANT }, $set: { [MARKER]: new Date() } });
    console.log(`Gave +${GRANT} points to ${res.modifiedCount} users.`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
