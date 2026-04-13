const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const connString = process.env.MONGO_URI;
        
        if (!connString) {
            console.warn('⚠️ MONGO_URI not configured. Check your .env file or Render environment variables.');
            return;
        }

        await mongoose.connect(connString);
        console.log('✅ DB Connected');
    } catch (err) {
        console.error(`❌ MongoDB Connection Error: ${err.message}`);
        // Exit process with failure
        process.exit(1);
    }
};

module.exports = connectDB;
