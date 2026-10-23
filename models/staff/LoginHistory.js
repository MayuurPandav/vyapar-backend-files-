const mongoose = require('mongoose');

const loginHistorySchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    successful: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);
module.exports = LoginHistory;
