const mongoose = require('mongoose');
const { Schema } = mongoose;

const CategorySchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        max: 100
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        default: 'expense'
    },
    // Semantic group assigned by the AI classifier
    group: {
        type: String,
        enum: ['essential', 'discretionary', 'savings', 'social', 'income', 'other'],
        default: 'other',
    },
    groupConfidence: {
        type: Number,
        default: 0,
        min: 0,
        max: 1,
    },
}, {
    timestamps: true
});

// Unique per user — different users can have categories with the same name
CategorySchema.index({ user: 1, name: 1 }, { unique: true });

const Category = mongoose.model("Category", CategorySchema);

// Drop the old global unique index on name (existed before user-scoped index was added).
// Silent no-op if the index no longer exists.
mongoose.connection.on('connected', () => {
    Category.collection.dropIndex('name_1').catch(() => {});
});

module.exports = Category;
