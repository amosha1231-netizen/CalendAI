// Seeds the built-in challenges (config/featuredChallenges.js) into the Goal
// collection. Upsert by featuredKey: editing a title updates it, nothing is
// ever duplicated, and participants are never touched.
const FEATURED = require('../config/featuredChallenges');

function featuredDoc(c) {
  return {
    title: c.title,
    titleEn: c.titleEn || '',
    description: c.description || '',
    descriptionEn: c.descriptionEn || '',
    emoji: c.emoji || '',
    category: c.category || 'general',
    durationDays: c.days || null,
    kind: 'challenge',
    isPublic: true
  };
}

async function seedFeaturedChallenges(Goal, list = FEATURED) {
  let count = 0;
  for (const c of list) {
    if (!c || !c.key || !c.title) continue;
    await Goal.updateOne(
      { featuredKey: c.key },
      { $set: featuredDoc(c), $setOnInsert: { featuredKey: c.key, participants: [], messages: [], createdAt: new Date() } },
      { upsert: true }
    );
    count += 1;
  }
  return count;
}

/** Escape user text for a case-insensitive RegExp. */
function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mongo filter for the public search: words of the query are matched (all of
 * them) against the Hebrew and English title, the description and the
 * category, so "מים" finds "לשתות 3 ליטר מים ביום" and "water" finds it too.
 */
function buildSearchFilter(q, category) {
  const filter = { isPublic: true, kind: { $ne: 'task' } };
  const words = String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length) {
    filter.$and = words.map(w => {
      const re = { $regex: escapeRegex(w).slice(0, 60), $options: 'i' };
      return { $or: [{ title: re }, { titleEn: re }, { description: re }, { descriptionEn: re }, { category: re }] };
    });
  }
  if (category && category !== 'all') filter.category = category;
  return filter;
}

module.exports = { seedFeaturedChallenges, featuredDoc, escapeRegex, buildSearchFilter, FEATURED };
