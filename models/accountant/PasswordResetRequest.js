const mongoose = require('mongoose');

const passwordResetRequestSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail:   { type: String, required: true },
  userName:    { type: String, required: true },
  status:      { type: String, enum: ['pending', 'approved', 'rejected', 'used'], default: 'pending' },
  otp:         { type: String },          // plain OTP stored temporarily (deleted after use)
  otpExpiry:   { type: Date },            // 10 minutes from approval
  adminToken:  { type: String, required: true, unique: true }, // token embedded in admin approval link
  requestedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PasswordResetRequest', passwordResetRequestSchema);
