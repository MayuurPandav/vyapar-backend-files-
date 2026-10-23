const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/staff/User');
const LoginHistory = require('../../models/staff/LoginHistory');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const normalizedRole = ['admin', 'staff', 'cashier', 'delivery_boy'].includes(role) ? role : 'staff';
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('Email already registered');
  }

  const user = await User.create({ name, email, password, role: normalizedRole });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  console.log('[DEBUG] Staff Login Attempt:', { email, password });
  const user = await User.findOne({ email });
  console.log('[DEBUG] Found User:', user);
  
  let successful = false;
  if (user) {
    successful = await user.matchPassword(password);
    console.log('[DEBUG] Password Match Result:', successful);
  }

  if (user) {
    await LoginHistory.create({
      user: user._id,
      email: user.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
      successful,
    });
  }

  if (successful) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      profileImage: user.profileImage,
      permissions: user.permissions,
      token: generateToken(user._id),
    });
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});

const logoutUser = asyncHandler(async (req, res) => {
  res.json({ message: 'Logout successful' });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error('No account found for this email');
  }

  const resetToken = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
  await user.save();

  res.json({ message: 'Password reset token created', resetToken });
});

const getLoginHistory = asyncHandler(async (req, res) => {
  const history = await LoginHistory.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
  res.json(history);
});

module.exports = { registerUser, loginUser, logoutUser, forgotPassword, getLoginHistory };

