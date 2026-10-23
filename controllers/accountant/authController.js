const User = require('../../models/accountant/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../../middleware/accountant/asyncHandler');

// Register user
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Please provide all fields' });
  let user = await User.findOne({ email });
  if (user) return res.status(400).json({ success: false, message: 'User already exists' });
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(password, salt);

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const employeeId = `EMP-2026-${suffix}`;

  user = await User.create({ name, email, password: hashed, employeeId });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  res.status(201).json({ success: true, data: { user: { id: user._id, name: user.name, email: user.email, employeeId: user.employeeId }, token } });
});

// Login user — accepts email OR employeeId as identifier
exports.login = asyncHandler(async (req, res) => {
  const { identifier, email, password } = req.body;
  const loginId = identifier || email;
  if (!loginId || !password) return res.status(400).json({ success: false, message: 'Provide Employee ID (or email) and password' });

  let user = await User.findOne({ employeeId: loginId });
  if (!user) user = await User.findOne({ email: loginId });
  if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

  if (!user.employeeId) {
    const suffix = user._id.toString().substring(18).toUpperCase() || Math.floor(1000 + Math.random() * 9000);
    user.employeeId = `EMP-2026-${suffix}`;
    await user.save();
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  const userResponse = await User.findById(user._id).select('-password');
  res.json({ success: true, data: { user: userResponse, token } });
});

// Get profile
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  if (user && !user.employeeId) {
    const suffix = user._id.toString().substring(18).toUpperCase() || Math.floor(1000 + Math.random() * 9000);
    user.employeeId = `EMP-2026-${suffix}`;
    await user.save();
  }
  res.json({ success: true, data: user });
});

// Update profile details
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (email && email !== user.email) {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already in use by another operator' });
    user.email = email;
  }

  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;

  if (!user.employeeId) {
    const suffix = user._id.toString().substring(18).toUpperCase() || Math.floor(1000 + Math.random() * 9000);
    user.employeeId = `EMP-2026-${suffix}`;
  }

  await user.save();
  const updatedUser = await User.findById(req.user._id).select('-password');
  res.json({ success: true, data: updatedUser, message: 'Profile updated successfully' });
});

// Change password
exports.changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) return res.status(400).json({ success: false, message: 'Old password incorrect' });
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();
  res.json({ success: true, message: 'Password changed' });
});
