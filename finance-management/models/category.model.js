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
    }
}, {
    timestamps: true
});

// Unique per user — different users can have categories with the same name
CategorySchema.index({ user: 1, name: 1 }, { unique: true });

const Category = mongoose.model("Category", CategorySchema);

module.exports = Category;
