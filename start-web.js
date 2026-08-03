// ملف بسيط لتشغيل خادم الويب فقط للاختبار
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./src/config');
const attendanceStore = require('./src/attendanceStore');

const app = express();
const PORT = process.env.WEB_PORT || 3002;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware للتحقق من كلمة المرور
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const password = process.env.DASHBOARD_PASSWORD || 'admin123';

  if (!authHeader) {
    return res.status(401).json({ error: 'مطلوب authorization header' });
  }

  if (authHeader !== password) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }

  next();
}

// صفحة تسجيل الدخول
app.get('/', (req, res) => {
  console.log('تم طلب الصفحة الرئيسية');
  try {
    res.render('login');
  } catch (error) {
    console.error('خطأ في تحميل صفحة تسجيل الدخول:', error);
    res.status(500).send('خطأ في تحميل الصفحة');
  }
});

// endpoint للتحقق من كلمة المرور
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const correctPassword = process.env.DASHBOARD_PASSWORD || 'admin123';

  if (password === correctPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
  }
});

// صفحة لوحة التحكم
app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', {
    botName: 'زياد بوينت',
    version: '1.0.0'
  });
});

// API للحصول على الإحصائيات
app.get('/api/stats', requireAuth, (req, res) => {
  const activeUsers = attendanceStore.getAllActive();
  const weeklyLeaderboard = attendanceStore.getWeeklyLeaderboard();
  const exemptions = attendanceStore.getExemptions();
  const warningChannelId = attendanceStore.getWarningChannelId();

  res.json({
    activeUsers: activeUsers.length,
    totalWeeklyUsers: weeklyLeaderboard.length,
    totalWeeklyMinutes: weeklyLeaderboard.reduce((sum, u) => sum + u.totalMinutes, 0),
    exemptionsCount: exemptions.length,
    warningChannelSet: !!warningChannelId,
    absentHours: config.absentHours,
    checkInterval: config.absentCheckIntervalMinutes
  });
});

// API للحصول على المستخدمين النشطين
app.get('/api/active-users', requireAuth, (req, res) => {
  const activeUsers = attendanceStore.getAllActive();
  const usersWithInfo = activeUsers.map(user => ({
    userId: user.userId,
    loginAt: user.loginAt,
    loginTime: new Date(user.loginAt).toLocaleString('ar-SA'),
    durationMinutes: Math.floor((Date.now() - user.loginAt) / 60000)
  }));

  res.json(usersWithInfo);
});

// API للحصول على الترتيب الأسبوعي
app.get('/api/leaderboard', requireAuth, (req, res) => {
  const leaderboard = attendanceStore.getWeeklyLeaderboard();
  const leaderboardWithInfo = leaderboard.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    totalMinutes: entry.totalMinutes,
    formattedDuration: attendanceStore.formatDuration(entry.totalMinutes)
  }));

  res.json(leaderboardWithInfo);
});

// API للحصول على المستثنين
app.get('/api/exemptions', requireAuth, (req, res) => {
  const exemptions = attendanceStore.getExemptions();
  res.json(exemptions);
});

// API لإضافة استثناء
app.post('/api/exemptions', requireAuth, (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
  }

  attendanceStore.addExempt(userId);
  res.json({ success: true, message: 'تم إضافة الاستثناء بنجاح' });
});

// API لإزالة استثناء
app.delete('/api/exemptions/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  attendanceStore.removeExempt(userId);
  res.json({ success: true, message: 'تم إزالة الاستثناء بنجاح' });
});

// API لتسجيل خروج مستخدم
app.post('/api/force-logout', requireAuth, (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
  }

  const result = attendanceStore.logout(userId);
  if (!result.ok) {
    return res.status(400).json({ error: 'المستخدم غير مسجل دخول' });
  }

  res.json({
    success: true,
    message: 'تم تسجيل الخروج بنجاح',
    sessionMinutes: result.sessionMinutes,
    weeklyMinutes: result.weeklyMinutes
  });
});

// API لتصفير ساعات مستخدم
app.post('/api/reset-user', requireAuth, (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
  }

  attendanceStore.resetUser(userId);
  res.json({ success: true, message: 'تم تصفير ساعات المستخدم بنجاح' });
});

// API لتصفير ساعات الجميع
app.post('/api/reset-all', requireAuth, (req, res) => {
  attendanceStore.resetAll();
  res.json({ success: true, message: 'تم تصفير ساعات الجميع بنجاح' });
});

// API لتعيين روم التحذير
app.post('/api/warning-channel', requireAuth, (req, res) => {
  const { channelId } = req.body;
  if (!channelId) {
    return res.status(400).json({ error: 'معرف الروم مطلوب' });
  }

  attendanceStore.setWarningChannelId(channelId);
  res.json({ success: true, message: 'تم تعيين روم التحذير بنجاح' });
});

// API للحصول على معلومات مستخدم محدد
app.get('/api/user/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  const active = attendanceStore.getActive(userId);
  const weeklyMinutes = attendanceStore.getWeeklyMinutes(userId);
  const isExempt = attendanceStore.isExempt(userId);

  res.json({
    userId,
    isActive: !!active,
    loginAt: active?.loginAt || null,
    loginTime: active ? new Date(active.loginAt).toLocaleString('ar-SA') : null,
    weeklyMinutes,
    formattedDuration: attendanceStore.formatDuration(weeklyMinutes),
    isExempt
  });
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error('خطأ في الخادم:', err);
  res.status(500).json({ error: 'خطأ في الخادم' });
});

// بدء الخادم
const server = app.listen(PORT, () => {
  console.log(`لوحة التحكم الويب شغالة على: http://localhost:${PORT}`);
  console.log(`كلمة المرور: ${process.env.DASHBOARD_PASSWORD || 'admin123'}`);
  console.log('اضغط Ctrl+C لإيقاف الخادم');
});

// منع الخروج
process.on('SIGINT', () => {
  console.log('\nجاري إيقاف الخادم...');
  server.close(() => {
    console.log('تم إيقاف الخادم');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nجاري إيقاف الخادم...');
  server.close(() => {
    console.log('تم إيقاف الخادم');
    process.exit(0);
  });
});

// إبقاء العملية شغالة
setInterval(() => {
  // heartbeat لمنع الخروج
}, 1000);