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
  sixMonth: 1800000,
  oneYear: 3600000
};

// Helper Functions
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

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

// Landing Page
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تبلیغ یار</title>
  <style>
    body { font-family: Tahoma; background: #0052cc; margin: 0; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .navbar { background: white; padding: 20px; border-radius: 10px; margin-bottom: 30px; }
    .navbar h1 { color: #0052cc; margin: 0; }
    .hero { background: white; padding: 50px; border-radius: 10px; text-align: center; margin-bottom: 30px; }
    .hero h1 { color: #0052cc; font-size: 36px; margin-bottom: 10px; }
    .buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 30px; }
    .btn { padding: 15px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; color: white; text-decoration: none; display: inline-block; }
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
        <a href="/business-request.html" class="btn btn-secondary">درخواست</a>
        <a href="/signup.html" class="btn btn-info">ثبت‌نام</a>
        <a href="/login.html" class="btn btn-warning">ورود</a>
      </div>
    </div>
  </div>
</body>
</html>`);
});

app.get('/business-request.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>درخواست تبلیغ</title>
  <style>
    body { font-family: Tahoma; background: #0052cc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .form { background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 400px; }
    .form h1 { color: #0052cc; text-align: center; margin-bottom: 20px; }
    .iban { background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
    .group { margin-bottom: 15px; }
    .group label { display: block; font-weight: bold; margin-bottom: 5px; }
    .group input, .group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
    .btn { width: 100%; padding: 10px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
  </style>
</head>
<body>
  <div class="form">
    <h1>درخواست تبلیغ</h1>
    <div class="iban"><strong>حساب: IR360190000000216518589002</strong></div>
    <form id="form">
      <div class="group">
        <label>نام کسب‌وکار:</label>
        <input type="text" id="name" required>
      </div>
      <div class="group">
        <label>تلفن:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="group">
        <label>آدرس:</label>
        <input type="text" id="address" required>
      </div>
      <div class="group">
        <label>پکیج:</label>
        <select id="package" required>
          <option value="sixMonth">شش‌ماهه - 1,800,000 تومان</option>
          <option value="oneYear">یک‌ساله - 3,600,000 تومان</option>
        </select>
      </div>
      <div class="group">
        <label>کد معرفی (اختیاری):</label>
        <input type="text" id="code">
      </div>
      <button type="submit" class="btn">ثبت</button>
    </form>
    <div id="msg" style="margin-top: 10px; text-align: center;"></div>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/business-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: document.getElementById('name').value,
          businessPhone: document.getElementById('phone').value,
          businessAddress: document.getElementById('address').value,
          packageType: document.getElementById('package').value,
          referrerCode: document.getElementById('code').value
        })
      });
      const data = await res.json();
      document.getElementById('msg').textContent = data.success ? 'شماره پیگیری: ' + data.refId : 'خطا!';
    });
  </script>
</body>
</html>`);
});

app.get('/signup.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ثبت‌نام</title>
  <style>
    body { font-family: Tahoma; background: #0052cc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .form { background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 350px; }
    .form h1 { color: #0052cc; text-align: center; margin-bottom: 20px; }
    .group { margin-bottom: 15px; }
    .group label { display: block; font-weight: bold; margin-bottom: 5px; }
    .group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
    .btn { width: 100%; padding: 10px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
    .msg { margin-top: 10px; padding: 10px; background: #d4edda; text-align: center; display: none; }
  </style>
</head>
<body>
  <div class="form">
    <h1>ثبت‌نام</h1>
    <form id="form">
      <div class="group">
        <label>نام:</label>
        <input type="text" id="name" required>
      </div>
      <div class="group">
        <label>شماره:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="group">
        <label>رمز:</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn">ثبت‌نام</button>
    </form>
    <div id="msg" class="msg"></div>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: document.getElementById('name').value, phone: document.getElementById('phone').value, password: document.getElementById('password').value })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('msg').style.display = 'block';
        document.getElementById('msg').textContent = 'کد شما: ' + data.referralCode;
      }
    });
  </script>
</body>
</html>`);
});

app.get('/login.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود</title>
  <style>
    body { font-family: Tahoma; background: #0052cc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .form { background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 350px; }
    .form h1 { color: #0052cc; text-align: center; margin-bottom: 20px; }
    .group { margin-bottom: 15px; }
    .group label { display: block; font-weight: bold; margin-bottom: 5px; }
    .group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
    .btn { width: 100%; padding: 10px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
  </style>
</head>
<body>
  <div class="form">
    <h1>ورود</h1>
    <form id="form">
      <div class="group">
        <label>شماره:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="group">
        <label>رمز:</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn">ورود</button>
    </form>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
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

app.get('/dashboard.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>داشبورد</title>
  <style>
    body { font-family: Tahoma; background: #f5f5f5; }
    .nav { background: #0052cc; color: white; padding: 20px; text-align: center; }
    .container { max-width: 1000px; margin: 20px auto; padding: 20px; }
    .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
    .stat { background: #0052cc; color: white; padding: 15px; text-align: center; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: right; border-bottom: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="nav"><h1>داشبورد</h1></div>
  <div class="container">
    <div class="card">
      <div class="stats" id="stats"></div>
    </div>
    <div class="card">
      <h2>درخواست‌ها</h2>
      <table id="table"><thead><tr><th>نام</th><th>پکیج</th><th>مبلغ</th></tr></thead><tbody></tbody></table>
    </div>
    <button onclick="logout()" style="padding: 10px 20px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer;">خروج</button>
  </div>
  <script>
    async function load() {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/dashboard', { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await res.json();
      document.getElementById('stats').innerHTML = '<div class="stat">' + data.name + '</div><div class="stat">' + data.referralCode + '</div><div class="stat">' + data.totalEarnings.toLocaleString('fa') + '</div>';
      data.requests.forEach(r => document.querySelector('#table tbody').innerHTML += '<tr><td>' + r.businessName + '</td><td>' + r.packageType + '</td><td>' + r.amount.toLocaleString('fa') + '</td></tr>');
    }
    function logout() { localStorage.removeItem('token'); window.location.href = '/'; }
    load();
  </script>
</body>
</html>`);
});

app.get('/directory.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>دایرکتوری</title>
  <style>
    body { font-family: Tahoma; background: #f5f5f5; }
    .nav { background: #0052cc; color: white; padding: 20px; text-align: center; }
    .container { max-width: 1200px; margin: 20px auto; padding: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; }
    .card { background: white; padding: 20px; border-radius: 10px; }
    .card h3 { color: #0052cc; margin: 0 0 10px 0; }
  </style>
</head>
<body>
  <div class="nav"><h1>دایرکتوری</h1></div>
  <div class="container"><div class="grid" id="grid"></div></div>
  <script>
    async function load() {
      const res = await fetch('/api/directory');
      const data = await res.json();
      data.forEach(b => document.getElementById('grid').innerHTML += '<div class="card"><h3>' + b.businessName + '</h3><p>' + b.businessAddress + '</p><p>📱 ' + b.businessPhone + '</p></div>');
    }
    load();
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
