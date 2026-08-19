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
    // True = user set this group by hand; classifyAll must not overwrite it
    groupOverridden: {
        type: Boolean,
        default: false,
    },
    // Structured signal from the seed defaults, not a name guess: the recurring detector loosens its amount gate for these
    isUtility: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true
});

CategorySchema.index({ user: 1, name: 1 }, { unique: true });

const Category = mongoose.model("Category", CategorySchema);

// Drops the legacy global unique index on name; silent no-op once it is gone.
mongoose.connection.on('connected', () => {
    Category.collection.dropIndex('name_1').catch(() => {});
});

module.exports = Category;
