const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../../models/staff/User');

const protect = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer')) {
    token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Not authorized, user not found' });
      }

      if (!req.user.isActive) {
        return res.status(403).json({ status: 'error', message: 'Account is deactivated' });
      }

      next();
    } catch (error) {
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ status: 'error', message: 'Admin access required' });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      next();
    } else {
      return res.status(403).json({ status: 'error', message: 'Permission denied' });
    }
  };
};

const checkPermission = (permissionName) => {
  return (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.permissions?.[permissionName])) {
      next();
    } else {
      return res.status(403).json({
        status: 'error',
        message: `Permission denied: requires ${permissionName} or admin role`
      });
    }
  };
};

module.exports = { protect, adminOnly, authorizeRoles, checkPermission };

