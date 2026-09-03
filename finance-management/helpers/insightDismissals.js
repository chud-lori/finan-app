const InsightDismissal = require('../models/insightDismissal.model');

const getDismissedSubjects = async (userId, kind) => {
    const rows = await InsightDismissal
        .find({ user: userId, kind, expiresAt: { $gt: new Date() } })
        .select('subject')
        .limit(InsightDismissal.MAX_DISMISSALS_PER_USER)
        .lean();
    return new Set(rows.map(r => (r.subject || '').toLowerCase()));
};

module.exports = { getDismissedSubjects };
