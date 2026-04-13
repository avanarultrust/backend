const mongoose = require('mongoose');

const SlideshowSchema = new mongoose.Schema({
    slideId: {
        type: Number,
        required: true,
        unique: true
    },
    image: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    subtitle: {
        type: String,
        required: false
    },
    btn1Text: {
        type: String,
        default: 'Our Mission'
    },
    btn1Link: {
        type: String,
        default: '#mission'
    },
    btn2Text: {
        type: String,
        default: 'Donate Now'
    },
    btn2Link: {
        type: String,
        default: 'donate.html'
    }
}, { timestamps: true });

module.exports = mongoose.model('Slideshow', SlideshowSchema);
