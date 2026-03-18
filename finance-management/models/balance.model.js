const mongoose = require('mongoose');
const { Schema } = mongoose;

const BalanceSchema = new Schema({
    user:{
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    amount: {
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

const Balance = mongoose.model("Balance", BalanceSchema);

module.exports = Balance;