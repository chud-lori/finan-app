const mongoose = require('mongoose');
const { Schema } = mongoose;

const CategorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
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

const Category = mongoose.model("Category", CategorySchema);

module.exports = Category;
