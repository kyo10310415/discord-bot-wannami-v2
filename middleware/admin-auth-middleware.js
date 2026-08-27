function getAllowedAdminRoles() {
  return new Set(
    String(process.env.ADMIN_ROLES || 'admin,owner')
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean)
  );
}

function requireAdmin(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role && getAllowedAdminRoles().has(role)) {
    return next();
  }

  if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }

  return res.status(403).send(`<!doctype html>
    <html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>アクセスできません</title></head>
    <body style="font-family:system-ui,sans-serif;padding:48px;background:#f5f7f5;color:#16211d">
      <h1>管理者権限が必要です</h1><p>WannaV管理者アカウントでログインしてください。</p>
    </body></html>`);
}

function requireAdminRequestHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-wannav-admin-request') === '1') return next();
  return res.status(403).json({ error: '不正な管理画面リクエストです' });
}

module.exports = { requireAdmin, requireAdminRequestHeader, getAllowedAdminRoles };
