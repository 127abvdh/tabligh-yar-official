const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const MONGO_URI = 'mongodb+srv://azam71farahani_db_user:VnI4CipodA1GMfgV@cluster0.zrmkmdc.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB Connected');
}).catch(err => {
  console.error('MongoDB Error:', err);
});

// Schemas
const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  password: String,
  referralCode: { type: String, unique: true },
  totalEarnings: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const businessRequestSchema = new mongoose.Schema({
  businessName: String,
  businessPhone: String,
  businessAddress: String,
  packageType: String,
  amount: Number,
  referrerUserId: mongoose.Schema.Types.ObjectId,
  referrerCode: String,
  paymentStatus: { type: String, default: 'pending' },
  refId: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const BusinessRequest = mongoose.model('BusinessRequest', businessRequestSchema);

// Constants
const BANK_SHEBA = 'IR360190000000216518589002';
const PACKAGES = {
  bronze: 5000000,
  silver: 15000000,
  gold: 40000000
};

// Helper Functions
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ===== API Routes =====

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'تمام فیلدها الزامی هستند' });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ error: 'این شماره موجود است' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = generateReferralCode();

    const user = new User({
      name,
      phone,
      password: hashedPassword,
      referralCode
    });

    await user.save();
    res.json({ success: true, referralCode, message: 'ثبت‌نام موفق' });
  } catch (error) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: 'شماره و رمز الزامی هستند' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ error: 'کاربر یافت نشد' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'رمز غلط است' });
    }

    const token = jwt.sign({ userId: user._id }, 'secret_key', { expiresIn: '30d' });
    res.json({ success: true, token, userId: user._id });
  } catch (error) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// Business Request
app.post('/api/business-request', async (req, res) => {
  try {
    const { businessName, businessPhone, businessAddress, packageType, referrerCode } = req.body;
    
    if (!businessName || !businessPhone || !packageType) {
      return res.status(400).json({ error: 'تمام فیلدها الزامی هستند' });
    }

    const amount = PACKAGES[packageType];
    if (!amount) {
      return res.status(400).json({ error: 'پکیج نامعتبر' });
    }

    let referrerUser = null;
    if (referrerCode) {
      referrerUser = await User.findOne({ referralCode: referrerCode });
    }

    const refId = 'REF-' + Date.now();
    const commission = Math.floor(amount * 0.65);

    const request = new BusinessRequest({
      businessName,
      businessPhone,
      businessAddress,
      packageType,
      amount,
      referrerUserId: referrerUser?._id,
      referrerCode,
      paymentStatus: 'completed',
      refId
    });

    await request.save();

    if (referrerUser) {
      await User.updateOne(
        { _id: referrerUser._id },
        { $inc: { totalEarnings: commission } }
      );
    }

    res.json({ 
      success: true, 
      refId, 
      amount, 
      commission,
      message: 'درخواست ثبت شد'
    });
  } catch (error) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غیرمجاز' });

    const decoded = jwt.verify(token, 'secret_key');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'کاربر یافت نشد' });

    const requests = await BusinessRequest.find({ referrerUserId: user._id });
    
    res.json({
      name: user.name,
      phone: user.phone,
      referralCode: user.referralCode,
      totalEarnings: user.totalEarnings,
      requestCount: requests.length,
      requests
    });
  } catch (error) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// Directory
app.get('/api/directory', async (req, res) => {
  try {
    const requests = await BusinessRequest.find({ paymentStatus: 'completed' });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// ===== HTML Pages =====

// Landing Page
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تبلیغ یار - پلتفرم تبلیغات</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI'; background: #0052cc; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .navbar { background: white; padding: 15px 20px; border-radius: 10px; margin-bottom: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .navbar h1 { color: #0052cc; font-size: 24px; }
    .hero { background: white; padding: 60px 40px; border-radius: 15px; text-align: center; margin-bottom: 40px; box-shadow: 0 2px 15px rgba(0,0,0,0.1); }
    .hero h1 { font-size: 48px; color: #0052cc; margin-bottom: 20px; }
    .buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 30px; }
    .btn { padding: 20px; border: none; border-radius: 10px; font-size: 16px; cursor: pointer; transition: all 0.3s; text-decoration: none; display: inline-block; color: white; font-weight: bold; }
    .btn-primary { background: #0052cc; }
    .btn-secondary { background: #4CAF50; }
    .btn-info { background: #2196F3; }
    .btn-warning { background: #ff9800; }
  </style>
</head>
<body>
  <div class="container">
    <div class="navbar"><h1>تبلیغ یار</h1></div>
    <div class="hero">
      <h1>خوش آمدید</h1>
      <p>پلتفرم تبلیغات آنلاین</p>
      <div class="buttons">
        <a href="/directory.html" class="btn btn-primary">دایرکتوری</a>
        <a href="/business-request.html" class="btn btn-secondary">درخواست تبلیغ</a>
        <a href="/signup.html" class="btn btn-info">ثبت نام</a>
        <a href="/login.html" class="btn btn-warning">ورود</a>
      </div>
    </div>
  </div>
</body>
</html>`);
});

// Signup Page
app.get('/signup.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ثبت نام</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI'; background: #0052cc; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .form-container { background: white; padding: 40px; border-radius: 15px; width: 100%; max-width: 400px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
    .form-container h1 { color: #0052cc; margin-bottom: 30px; text-align: center; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; margin-bottom: 8px; color: #333; font-weight: bold; }
    .form-group input { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; }
    .btn-submit { width: 100%; padding: 12px; background: #0052cc; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
    .msg { margin-top: 20px; padding: 15px; border-radius: 8px; text-align: center; }
    .success { background: #d4edda; color: #155724; }
  </style>
</head>
<body>
  <div class="form-container">
    <h1>ثبت نام</h1>
    <form id="signupForm">
      <div class="form-group">
        <label>نام:</label>
        <input type="text" id="name" required>
      </div>
      <div class="form-group">
        <label>شماره:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="form-group">
        <label>رمز:</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn-submit">ثبت نام</button>
    </form>
    <div id="message"></div>
  </div>
  <script>
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: document.getElementById('name').value, phone: document.getElementById('phone').value, password: document.getElementById('password').value })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('message').className = 'msg success';
        document.getElementById('message').textContent = 'کد: ' + data.referralCode;
      }
    });
  </script>
</body>
</html>`);
});

// Login Page
app.get('/login.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI'; background: #0052cc; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .form-container { background: white; padding: 40px; border-radius: 15px; width: 100%; max-width: 400px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
    .form-container h1 { color: #0052cc; margin-bottom: 30px; text-align: center; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; margin-bottom: 8px; color: #333; font-weight: bold; }
    .form-group input { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; }
    .btn-submit { width: 100%; padding: 12px; background: #0052cc; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
    .msg { margin-top: 20px; padding: 15px; border-radius: 8px; text-align: center; }
    .success { background: #d4edda; color: #155724; }
  </style>
</head>
<body>
  <div class="form-container">
    <h1>ورود</h1>
    <form id="loginForm">
      <div class="form-group">
        <label>شماره:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="form-group">
        <label>رمز:</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn-submit">ورود</button>
    </form>
    <div id="message"></div>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: document.getElementById('phone').value, password: document.getElementById('password').value })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        window.location.href = '/dashboard.html';
      }
    });
  </script>
</body>
</html>`);
});

// Dashboard Page
app.get('/dashboard.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>داشبورد</title>
  <style>
    body { font-family: 'Segoe UI'; background: #f5f5f5; }
    .navbar { background: #0052cc; color: white; padding: 20px; text-align: center; }
    .container { max-width: 1000px; margin: 20px auto; padding: 20px; }
    .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .stat-card { background: #0052cc; color: white; padding: 20px; border-radius: 10px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { padding: 12px; text-align: right; border-bottom: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="navbar"><h1>داشبورد</h1></div>
  <div class="container">
    <div class="card" id="statsContainer"></div>
    <div class="card">
      <h2>درخواست ها</h2>
      <table id="requestsTable"><thead><tr><th>نام</th><th>پکیج</th><th>مبلغ</th></tr></thead><tbody></tbody></table>
    </div>
    <button onclick="logout()" style="padding: 10px 20px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer;">خروج</button>
  </div>
  <script>
    async function loadDashboard() {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/dashboard', { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await res.json();
      document.getElementById('statsContainer').innerHTML = '<div class="stat-card"><div>' + data.name + '</div></div><div class="stat-card"><div>' + data.referralCode + '</div></div><div class="stat-card"><div>' + data.totalEarnings + '</div></div>';
      data.requests.forEach(req => {
        document.querySelector('#requestsTable tbody').innerHTML += '<tr><td>' + req.businessName + '</td><td>' + req.packageType + '</td><td>' + req.amount + '</td></tr>';
      });
    }
    function logout() { localStorage.removeItem('token'); window.location.href = '/'; }
    loadDashboard();
  </script>
</body>
</html>`);
});

// Directory Page
app.get('/directory.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>دایرکتوری</title>
  <style>
    body { font-family: 'Segoe UI'; background: #f5f5f5; }
    .navbar { background: #0052cc; color: white; padding: 20px; text-align: center; }
    .container { max-width: 1200px; margin: 20px auto; padding: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .card h3 { color: #0052cc; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="navbar"><h1>دایرکتوری</h1></div>
  <div class="container"><div class="grid" id="directoryGrid"></div></div>
  <script>
    async function load() {
      const res = await fetch('/api/directory');
      const data = await res.json();
      data.forEach(b => {
        document.getElementById('directoryGrid').innerHTML += '<div class="card"><h3>' + b.businessName + '</h3><p>' + b.businessAddress + '</p><p>' + b.businessPhone + '</p></div>';
      });
    }
    load();
  </script>
</body>
</html>`);
});

// Business Request
app.get('/business-request.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>درخواست تبلیغ</title>
  <style>
    body { font-family: 'Segoe UI'; background: #0052cc; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .form-container { background: white; padding: 40px; border-radius: 15px; width: 100%; max-width: 500px; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; margin-bottom: 8px; font-weight: bold; }
    .form-group input, .form-group select { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; }
    .iban-box { background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
    .btn-submit { width: 100%; padding: 12px; background: #0052cc; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
  </style>
</head>
<body>
  <div class="form-container">
    <h1>درخواست تبلیغ</h1>
    <div class="iban-box"><p>حساب: IR360190000000216518589002</p></div>
    <form id="businessForm">
      <div class="form-group">
        <label>نام کسب وکار:</label>
        <input type="text" id="businessName" required>
      </div>
      <div class="form-group">
        <label>تلفن:</label>
        <input type="tel" id="businessPhone" required>
      </div>
      <div class="form-group">
        <label>آدرس:</label>
        <input type="text" id="businessAddress" required>
      </div>
      <div class="form-group">
        <label>پکیج:</label>
        <select id="packageType" required>
          <option value="bronze">برنز - 5000000</option>
          <option value="silver">نقره - 15000000</option>
          <option value="gold">طلا - 40000000</option>
        </select>
      </div>
      <div class="form-group">
        <label>کد معرفی:</label>
        <input type="text" id="referrerCode">
      </div>
      <button type="submit" class="btn-submit">ثبت</button>
    </form>
    <div id="message"></div>
  </div>
  <script>
    document.getElementById('businessForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/business-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          businessName: document.getElementById('businessName').value,
          businessPhone: document.getElementById('businessPhone').value,
          businessAddress: document.getElementById('businessAddress').value,
          packageType: document.getElementById('packageType').value,
          referrerCode: document.getElementById('referrerCode').value
        })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('message').textContent = 'ثبت شد: ' + data.refId;
      }
    });
  </script>
</body>
</html>`);
});

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
