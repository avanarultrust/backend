require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');
const connectDB = require('./db');
const User = require('./models/User');
const Donation = require('./models/Donation');
const Project = require('./models/Project');
const Slideshow = require('./models/Slideshow');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'super_secret_avanarul_key_123';

app.use(cors({
  origin: [
    "https://avanarul.org",
    "https://www.avanarul.org"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

/** First origin for password-reset links in emails. */
function getPrimaryFrontendBase() {
    return (process.env.FRONTEND_URL || "https://avanarul.org").replace(/\/$/, '');
}

// Admin Credentials
const ADMIN_EMAIL = 'avanarultrust@gmail.com';
const ADMIN_PASS = 'Avanarul@2026';

// Connect to Database
connectDB();

// Google Auth Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID_HERE';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });


app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route
app.get('/', (req, res) => {
    res.json({ message: 'Avanarul Trust API is running 🚀' });
});

// --- MIDDLEWARE --- //

// isAdmin Middleware
const isAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.email === ADMIN_EMAIL) {
            req.user = decoded;
            next();
        } else {
            res.status(403).json({ message: 'Access denied. Admins only.' });
        }
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// --- AUTH ROUTES --- //

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, mobile } = req.body;
        
        if (!name || !email || !password || !mobile) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email,
            mobile,
            password: hashedPassword
        });
        
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully!' });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        // Special Admin Check
        if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
            const token = jwt.sign(
                { id: 'admin', name: 'Admin', email: ADMIN_EMAIL, role: 'admin' },
                SECRET_KEY,
                { expiresIn: '24h' }
            );
            return res.status(200).json({
                message: 'Admin Login successful!',
                token,
                user: { id: 'admin', name: 'Admin', email: ADMIN_EMAIL, mobile: '9500300859', role: 'admin' }
            });
        }

        const user = await User.findOne({ email });
        if (!user || !user.password) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user._id, name: user.name, email: user.email, mobile: user.mobile }, 
            SECRET_KEY, 
            { expiresIn: '24h' }
        );

        res.status(200).json({
            message: 'Login successful!',
            token,
            user: { id: user._id, name: user.name, email: user.email, mobile: user.mobile }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// Forgot Password
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        await user.save();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'placeholder@gmail.com',
                pass: process.env.EMAIL_PASS || 'placeholder_pass'
            }
        });

        const resetUrl = `${getPrimaryFrontendBase()}/reset-password.html?token=${token}`;
        
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                await transporter.sendMail({
                    to: user.email,
                    from: process.env.EMAIL_USER,
                    subject: 'Avanarul Trust - Password Reset',
                    text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
                          `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
                          `${resetUrl}\n\n` +
                          `If you did not request this, please ignore this email and your password will remain unchanged.\n`
                });
                console.log(`Password reset email attempted for ${user.email}`);
            } catch (mailErr) {
                console.error("Mail Error (Check App Password):", mailErr.message);
                console.log(`[DEV MODE FALLBACK] Password Reset Link for ${user.email}: ${resetUrl}`);
            }
        } else {
            console.log(`[DEV MODE] Password Reset Link for ${user.email}: ${resetUrl}`);
        }

        res.status(200).json({ message: 'Recovery email sent! Check your inbox (or server console if in DEV).' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Error processing request.' });
    }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        
        const user = await User.findOne({ 
            resetPasswordToken: token, 
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        res.status(200).json({ message: 'Password has been successfully updated. You can now log in.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Error resetting password.' });
    }
});

// Google Auth, Verify Token ... (keeping these same but using new models/logic)
app.post('/api/google-auth', async (req, res) => {
    try {
        const { credential } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        const { sub: googleId, email, name, picture } = ticket.getPayload();
        let user = await User.findOne({ email });

        if (!user) {
            user = new User({ name, email, picture, googleId, mobile: '' });
            await user.save();
        }

        const token = jwt.sign(
            { id: user._id, name: user.name, email: user.email, mobile: user.mobile, picture: user.picture },
            SECRET_KEY,
            { expiresIn: '24h' }
        );
        res.status(200).json({
            message: 'Google login successful!',
            token,
            user: { id: user._id, name: user.name, email: user.email, mobile: user.mobile, picture: user.picture }
        });
    } catch (error) {
        res.status(401).json({ message: 'Google auth failed.' });
    }
});

app.get('/api/verify', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ valid: false });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // Special case for admin
        if (decoded.email === ADMIN_EMAIL) {
            return res.status(200).json({ 
                valid: true, 
                user: { ...decoded, mobile: '9500300859' } 
            });
        }
        
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ valid: false });
        
        res.status(200).json({ 
            valid: true, 
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                picture: user.picture
            } 
        });
    } catch (err) {
        res.status(401).json({ valid: false });
    }
});

// --- DONATION ROUTES --- //

app.post('/api/donate', async (req, res) => {
    try {
        const { amount, donorName, donorEmail, donorPhone, address, donorId, utr } = req.body;
        const donation = new Donation({
            donor: donorId === 'admin' ? null : (donorId || null),
            amount: parseFloat(amount),
            name: donorName,
            email: donorEmail,
            phone: donorPhone,
            address: address,
            paymentId: utr
        });
        await donation.save();
        res.status(201).json({ message: 'Donation recorded!', donationId: donation._id });
    } catch (error) {
        res.status(500).json({ message: 'Error recording donation.' });
    }
});

app.get('/api/user/donations', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const query = decoded.email === ADMIN_EMAIL ? {} : { $or: [{ donor: decoded.id }, { email: decoded.email }] };
        const donations = await Donation.find(query).sort({ timestamp: -1 });
        res.status(200).json(donations);
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// --- ADMIN SPECIFIC ROUTES --- //

// Delete Transaction (Admin Only)
app.delete('/api/admin/transactions/:id', isAdmin, async (req, res) => {
    try {
        const donation = await Donation.findByIdAndDelete(req.params.id);
        if (!donation) return res.status(404).json({ message: 'Transaction not found.' });
        res.status(200).json({ message: 'Transaction deleted successfully.' });
    } catch (error) {
        console.error('Delete transaction error:', error);
        res.status(500).json({ message: 'Error deleting transaction.' });
    }
});

// Get ALL Transactions (Admin Only)
app.get('/api/admin/transactions', isAdmin, async (req, res) => {
    try {
        const donations = await Donation.find().sort({ timestamp: -1 });
        res.status(200).json(donations);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching transactions.' });
    }
});

// Download Transactions CSV (Admin Only)
app.get('/api/admin/transactions/download', isAdmin, async (req, res) => {
    try {
        const donations = await Donation.find().sort({ timestamp: -1 });
        
        // CSV Headers
        let csv = 'Date,Name,Email,Phone,Amount,Status,Payment ID,Address\n';
        
        // Add data rows
        donations.forEach(d => {
            const date = new Date(d.timestamp).toLocaleDateString('en-IN');
            const addr = d.address ? `"${d.address.line}, ${d.address.city}, ${d.address.state} - ${d.address.pincode}, ${d.address.country}"` : 'N/A';
            csv += `${date},"${d.name}","${d.email}",${d.phone},${d.amount},${d.status},"${d.paymentId || 'Local'}",${addr}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=avanarul_transactions.csv');
        res.status(200).send(csv);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: 'Error generating download.' });
    }
});

// Add New Project (Admin Only, Multi-image)
app.post('/api/admin/projects', isAdmin, upload.array('images', 10), async (req, res) => {
    try {
        const { title, description } = req.body;
        const imagePaths = req.files.map(file => `/uploads/${file.filename}`);

        const project = new Project({
            title,
            description,
            images: imagePaths
        });

        await project.save();
        res.status(201).json({ message: 'Project added successfully!', project });
    } catch (error) {
        console.error('Project upload error:', error);
        res.status(500).json({ message: 'Error adding project.' });
    }
});

// Edit Project (Admin Only)
app.put('/api/admin/projects/:id', isAdmin, async (req, res) => {
    try {
        const { title, description } = req.body;
        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { title, description },
            { new: true, runValidators: true }
        );
        if (!project) return res.status(404).json({ message: 'Project not found.' });
        res.status(200).json({ message: 'Project updated successfully!', project });
    } catch (error) {
        console.error('Project update error:', error);
        res.status(500).json({ message: 'Error updating project.' });
    }
});

// Delete Project (Admin Only)
app.delete('/api/admin/projects/:id', isAdmin, async (req, res) => {
    try {
        const project = await Project.findByIdAndDelete(req.params.id);
        if (!project) return res.status(404).json({ message: 'Project not found.' });

        // Clean up uploaded images from disk
        project.images.forEach(imgPath => {
            const fullPath = path.join(__dirname, imgPath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        });

        res.status(200).json({ message: 'Project deleted successfully!' });
    } catch (error) {
        console.error('Project delete error:', error);
        res.status(500).json({ message: 'Error deleting project.' });
    }
});

// Public: Get all projects
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await Project.find().sort({ date: -1 });
        res.status(200).json(projects);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching projects.' });
    }
});

// Public: Get single project by ID
app.get('/api/projects/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) return res.status(404).json({ message: 'Project not found.' });
        res.status(200).json(project);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching project.' });
    }
});

// --- SLIDESHOW ROUTES --- //

// Public: Get all slides
app.get('/api/slideshow', async (req, res) => {
    try {
        const slides = await Slideshow.find().sort({ slideId: 1 });
        res.status(200).json(slides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching slideshow.' });
    }
});

// Admin: Update slide (with optional image)
app.put('/api/admin/slideshow/:id', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subtitle, btn1Text, btn1Link, btn2Text, btn2Link } = req.body;
        
        const updateData = { title, subtitle, btn1Text, btn1Link, btn2Text, btn2Link };
        if (req.file) {
            updateData.image = `/uploads/${req.file.filename}`;
        }

        const slide = await Slideshow.findOneAndUpdate(
            { slideId: parseInt(id) },
            updateData,
            { new: true, upsert: true }
        );

        res.status(200).json({ message: 'Slide updated successfully!', slide });
    } catch (error) {
        console.error('Slide update error:', error);
        res.status(500).json({ message: 'Error updating slide.' });
    }
});

// Initialize default slideshow data
async function initSlideshow() {
    try {
        const count = await Slideshow.countDocuments();
        if (count === 0) {
            const defaults = [
                {
                    slideId: 1,
                    image: '/temple-slideshow-v2.jpg',
                    title: 'Renovating and Preserving Hindu Temples',
                    btn1Text: 'Our Mission',
                    btn1Link: '#mission',
                    btn2Text: 'Donate Now',
                    btn2Link: 'donate.html'
                },
                {
                    slideId: 2,
                    image: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1920&q=80',
                    title: 'Empowering Communities Through Medical Awareness Programs',
                    btn1Text: 'Support Students',
                    btn1Link: '#',
                    btn2Text: 'Donate Now',
                    btn2Link: 'donate.html'
                },
                {
                    slideId: 3,
                    image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1920&q=80',
                    title: 'Supporting the Next Generation With Educational Support',
                    btn1Text: 'Our Programs',
                    btn1Link: '#programs',
                    btn2Text: 'Get Involved',
                    btn2Link: '#'
                }
            ];
            await Slideshow.insertMany(defaults);
            console.log('✅ Default slideshow data initialized.');
        }
    } catch (err) {
        console.error('Error initializing slideshow:', err);
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    initSlideshow();
});
