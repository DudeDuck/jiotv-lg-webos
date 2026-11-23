/* Channel ordering and hiding. Loaded by index.html (as window.JioTVChannelOrder)
   and by the Node tests (module.exports). IDs are Jio's channel IDs. */
(function(root) {
  'use strict';

  // Jio test channels that should never be listed.
  const HIDDEN_IDS = ['1229']; // TEST9 HD

  // Telugu: popular and HD channels first, in this order, then devotional channels.
  const TELUGU_FIRST = [
    '1112', // Maa HD
    '1973', // ETV HD
    '897', // Sun Gemini HD
    '760', // Maa Movies HD
    '899', // Sun Gemini Movies HD
    '1665', // ETV Cinema HD
    '2956', // ETV Plus HD
    '1137', // Maa Gold
    '729', // Sun Gemini Comedy
    '1129', // Maa Music
    '898', // Sun Gemini Music HD
    '1775', // Sony Ten 4 Telugu
    '3446', // Discovery HD Telugu
    '1080', // Cartoon Network HD+ Telugu
    '577', // History TV18 HD Telugu
    '3182', // Animal Planet HD Telugu
    // Devotional
    '598', // Sri Venkateshwar Bhakti
    '776', // Bhakti TV
    '955', // Hindu Dharmam
    '1254', // Aastha Telugu
    '3239', // Mahaa Bhakthi
    '3087', // Sai TV Telugu
    '772', // CVR OM Spiritual
    '1975' // PMC Telugu
  ];

  // Telugu news channels, in case Jio's own category is missing or wrong.
  // Any channel Jio files under "News" also counts.
  const TELUGU_NEWS = [
    '614', '618', '630', '632', '646', '664', '665', '666', '667', '668', '670', '769', '784', '790',
    '832', '2187', '2436', '2783', '2862', '2932', '3018', '3031', '3558'
  ];

  // Telugu Christian channels: listed last, after news.
  const TELUGU_CHRISTIAN = [
    '607', // Subhavartha TV
    '777', // Aradhana TV
    '934', // Divya Vani
    '977', // Calvary
    '3370' // Gospel TV
  ];

  const hidden = new Set(HIDDEN_IDS);
  const firstRank = new Map(TELUGU_FIRST.map((id, index) => [id, index]));
  const news = new Set(TELUGU_NEWS);
  const christian = new Set(TELUGU_CHRISTIAN);

  function isTelugu(channel) {
    return String(channel.language || '').trim().toLowerCase() === 'telugu';
  }
  function isVisible(channel) {
    return !hidden.has(String(channel.id));
  }

  // Sort key: [language block, tier, position in TELUGU_FIRST, channel ID].
  // Telugu tiers: 0 popular/HD/devotional, 1 the rest, 2 news, 3 Christian.
  function sortKey(channel) {
    const id = String(channel.id);
    const number = Number(id) || 0;
    if (!isTelugu(channel)) return [1, 0, 0, number];
    if (firstRank.has(id)) return [0, 0, firstRank.get(id), number];
    if (christian.has(id)) return [0, 3, 0, number];
    if (news.has(id) || String(channel.group || '').trim().toLowerCase() === 'news') return [0, 2, 0, number];
    return [0, 1, 0, number];
  }
  function compare(a, b) {
    const x = sortKey(a);
    const y = sortKey(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  }
  // Telugu channels in the custom order first; any other language follows in ID order.
  function sortTeluguFirst(channels) {
    return channels.slice().sort(compare);
  }

  // A movie channel: Jio files it under Movies, or its name says Movie(s) or Cinema.
  function isMovie(channel) {
    return String(channel.group || '').trim().toLowerCase() === 'movies' || /\b(movies?|cinema)\b/i.test(String(channel.title || channel.name || ''));
  }
  // Saved: movie channels first, then the rest; each part in the order above.
  function sortSaved(channels) {
    return channels.slice().sort((a, b) => (isMovie(a) ? 0 : 1) - (isMovie(b) ? 0 : 1) || compare(a, b));
  }

  const api = { isVisible, isMovie, sortTeluguFirst, sortSaved, HIDDEN_IDS, TELUGU_FIRST, TELUGU_NEWS, TELUGU_CHRISTIAN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JioTVChannelOrder = api;
})(this);
