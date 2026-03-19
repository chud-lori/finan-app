const mongoose = require('mongoose');
const { Schema } = mongoose;

const PreferenceSchema = new Schema({
    user:         { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currency:     { type: String, default: 'IDR' },
    timezone:     { type: String, default: 'Asia/Jakarta' },
    weekStartsOn: { type: String, enum: ['monday', 'sunday'], default: 'monday' },
    numberFormat: { type: String, enum: ['dot', 'comma'], default: 'dot' },
    // dot   = 1.000.000 (Indonesian style)
    // comma = 1,000,000 (Western style)
}, { timestamps: true });

const Preference = mongoose.model('Preference', PreferenceSchema);
module.exports = Preference;
