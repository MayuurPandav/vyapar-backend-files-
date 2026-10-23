const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    role: {
      type: String,
      enum: ['admin', 'staff', 'cashier', 'delivery_boy'],
      default: 'staff',
    },
    permissions: {
      canDiscount: { type: Boolean, default: false },
      canViewAllInvoices: { type: Boolean, default: false },
      canEditInventory: { type: Boolean, default: false },
      canManageDelivery: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: false },
      canEditRate: { type: Boolean, default: false },
      canIssueCredit: { type: Boolean, default: false },
      canAcceptPayment: { type: Boolean, default: true },
      canManageParties: { type: Boolean, default: false },
      canViewAccounts: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Virtual field to check if user is admin
userSchema.virtual('isAdmin').get(function () {
  return this.role === 'admin';
});

const User = mongoose.model('User', userSchema, 'staffusers');
module.exports = User;
