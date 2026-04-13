const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
    donor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Can be guest donations
    },
    amount: {
        type: Number,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: true
    },
    address: {
        line: String,
        city: String,
        state: String,
        pincode: String,
        country: String
    },
    paymentId: {
        type: String // To be filled by Razorpay/Stripe later
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed' // For now, since we haven't integrated the real gateway check
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Donation', donationSchema);
