const { verifyAccessToken } = require('../utils/generateToken');
const User = require('../models/User');
const { runWithTenantContext } = require('./tenantContext');

async function requireAuth(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer '
    
    // Verify token
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user from database without tenant filter, then scope subsequent queries by that user tenant
    const user = await runWithTenantContext({ tenantId: null, bypassTenant: true }, () =>
      User.findById(decoded.userId)
    );
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    // Attach user to request
    req.user = user;
    runWithTenantContext(
      {
        tenantId: user.tenantId ? String(user.tenantId) : null,
        bypassTenant: user.role === 'super_admin',
      },
      () => next()
    );
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { requireAuth };
