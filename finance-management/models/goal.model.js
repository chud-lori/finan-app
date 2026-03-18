const mongoose = require('mongoose');
const { Schema } = mongoose;

const GoalSchema = new Schema({
    user:{
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    description: {
        type: String,
        required: true
    },
    achieve: {
        type: Number, 
        enum: [1, 0], // 1: achieved, 0: not yet 
        default: 0
    },
    price: {
        type: Number, 
        required: true
    }
}, { 
    timestamps: { 
        currentTime: () => {
            const now = new Date();
            const offset = now.getTimezoneOffset();
            return new Date(now - (offset * 60000));
            }
     } });

const Goal = mongoose.model("Goal", GoalSchema);

module.exports = Goal;