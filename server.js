const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MONGO_URI = 'mongodb+srv://azam71farahani_db_user:VnI4CipodA1GMfgV@cluster0.zrmkmdc.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB Connected');
}).catch(err => {
  console.error('MongoDB Error:', err);
});

const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  password: String,
  referralCode: { type: String, unique: true },
  totalEarnings: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
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

const BANK_ACCOUNT = 'IR360190000000216518589002';
const PACKAGES = {
  sixMonth: 1800000,
  oneYear: 3600000
};
const ADMIN_PHONE = '09936695143';

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ error: 'Phone already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = generateReferralCode();
    const isAdmin = phone === ADMIN_PHONE;

    const user = new User({
      name,
      phone,
      password: hashedPassword,
      referralCode,
      isAdmin
    });

    await user.save();
    res.json({ success: true, referralCode, message: 'Signup successful' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Wrong password' });
    }

    const token = jwt.sign({ userId: user._id }, 'secret_key', { expiresIn: '30d' });
    res.json({ success: true, token, userId: user._id, isAdmin: user.isAdmin });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/business-request', async (req, res) => {
  try {
    const { businessName, businessPhone, businessAddress, packageType, referrerCode } = req.body;
    
    if (!businessName || !businessPhone || !packageType) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const amount = PACKAGES[packageType];
    if (!amount) {
      return res.status(400).json({ error: 'Invalid package' });
    }

    let referrerUser = null;
    if (referrerCode) {
      referrerUser = await User.findOne({ referralCode: referrerCode });
    }

    const refId = 'REF-' + Date.now();

    const request = new BusinessRequest({
      businessName,
      businessPhone,
      businessAddress,
      packageType,
      amount,
      referrerUserId: referrerUser?._id,
      referrerCode,
      paymentStatus: 'pending',
      refId
    });

    await request.save();

    res.json({ 
      success: true, 
      refId, 
      amount,
      bankAccount: BANK_ACCOUNT,
      message: 'Request submitted'
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/approve-payment', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, 'secret_key');
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { refId } = req.body;
    const request = await BusinessRequest.findOne({ refId });
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.paymentStatus === 'approved') {
      return res.status(400).json({ error: 'Already approved' });
    }

    request.paymentStatus = 'approved';
    await request.save();

    if (request.referrerUserId) {
      const commission = Math.floor(request.amount * 0.65 * 100) / 100;
      await User.updateOne(
        { _id: request.referrerUserId },
        { $inc: { totalEarnings: commission } }
      );
    }

    res.json({ success: true, message: 'Approved' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/pending', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, 'secret_key');
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const pending = await BusinessRequest.find({ paymentStatus: 'pending' }).sort({ createdAt: -1 });
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, 'secret_key');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const requests = await BusinessRequest.find({ referrerUserId: user._id });
    
    res.json({
      name: user.name,
      phone: user.phone,
      referralCode: user.referralCode,
      totalEarnings: user.totalEarnings,
      isAdmin: user.isAdmin,
      requestCount: requests.length,
      requests
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/directory', async (req, res) => {
  try {
    const requests = await BusinessRequest.find({ paymentStatus: 'approved' });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tabalighe Yar</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Tahoma; background: #0052cc; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .navbar { background: white; padding: 20px; border-radius: 10px; margin-bottom: 30px; }
    .navbar h1 { color: #0052cc; }
    .hero { background: white; padding: 50px; border-radius: 10px; text-align: center; margin-bottom: 30px; }
    .hero h1 { color: #0052cc; font-size: 36px; }
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
    <div class="navbar"><h1>Tabalighe Yar</h1></div>
    <div class="hero">
      <h1>Welcome</h1>
      <p>Advertising Platform</p>
      <div class="buttons">
        <a href="/directory.html" class="btn btn-primary">Directory</a>
        <a href="/business-request.html" class="btn btn-secondary">Advertise</a>
        <a href="/signup.html" class="btn btn-info">Signup</a>
        <a href="/login.html" class="btn btn-warning">Login</a>
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
  <title>Advertise</title>
  <style>
    body { font-family: Tahoma; background: #0052cc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .form { background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 400px; }
    .form h1 { color: #0052cc; text-align: center; margin-bottom: 20px; }
    .account { background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
    .group { margin-bottom: 15px; }
    .group label { display: block; font-weight: bold; margin-bottom: 5px; }
    .group input, .group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
    .btn { width: 100%; padding: 10px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
    .msg { margin-top: 10px; text-align: center; padding: 10px; background: #d4edda; display: none; }
  </style>
</head>
<body>
  <div class="form">
    <h1>Advertise Your Business</h1>
    <div class="account"><strong>Account: IR360190000000216518589002</strong></div>
    <form id="form">
      <div class="group">
        <label>Business Name:</label>
        <input type="text" id="name" required>
      </div>
      <div class="group">
        <label>Phone:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="group">
        <label>Address:</label>
        <input type="text" id="address" required>
      </div>
      <div class="group">
        <label>Package:</label>
        <select id="package" required>
          <option value="sixMonth">6 Months - 1,800,000 Toman</option>
          <option value="oneYear">1 Year - 3,600,000 Toman</option>
        </select>
      </div>
      <div class="group">
        <label>Referral Code:</label>
        <input type="text" id="code">
      </div>
      <button type="submit" class="btn">Submit</button>
    </form>
    <div id="msg" class="msg"></div>
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
      const msg = document.getElementById('msg');
      msg.style.display = 'block';
      if (data.success) {
        msg.textContent = 'Reference: ' + data.refId + ' - Transfer amount to account';
      }
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
  <title>Signup</title>
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
    <h1>Signup</h1>
    <form id="form">
      <div class="group">
        <label>Name:</label>
        <input type="text" id="name" required>
      </div>
      <div class="group">
        <label>Phone:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="group">
        <label>Password:</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn">Signup</button>
    </form>
    <div id="msg" class="msg"></div>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('name').value,
          phone: document.getElementById('phone').value,
          password: document.getElementById('password').value
        })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('msg').style.display = 'block';
        document.getElementById('msg').textContent = 'Code: ' + data.referralCode;
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
  <title>Login</title>
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
    <h1>Login</h1>
    <form id="form">
      <div class="group">
        <label>Phone:</label>
        <input type="tel" id="phone" required>
      </div>
      <div class="group">
        <label>Password:</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn">Login</button>
    </form>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: document.getElementById('phone').value,
          password: document.getElementById('password').value
        })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        if (data.isAdmin) {
          window.location.href = '/admin.html';
        } else {
          window.location.href = '/dashboard.html';
        }
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
  <title>Dashboard</title>
  <style>
    body { font-family: Tahoma; background: #f5f5f5; }
    .nav { background: #0052cc; color: white; padding: 20px; text-align: center; }
    .container { max-width: 1000px; margin: 20px auto; padding: 20px; }
    .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
    .stat { background: #0052cc; color: white; padding: 15px; text-align: center; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: right; border-bottom: 1px solid #ddd; }
    button { padding: 10px 20px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="nav"><h1>Dashboard</h1></div>
  <div class="container">
    <div class="card">
      <div class="stats" id="stats"></div>
    </div>
    <div class="card">
      <h2>Requests</h2>
      <table id="table"><thead><tr><th>Name</th><th>Package</th><th>Amount</th></tr></thead><tbody></tbody></table>
    </div>
    <button onclick="logout()">Logout</button>
  </div>
  <script>
    async function load() {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/dashboard', { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await res.json();
      document.getElementById('stats').innerHTML = '<div class="stat">' + data.name + '</div><div class="stat">' + data.referralCode + '</div><div class="stat">' + data.totalEarnings.toLocaleString() + '</div>';
      data.requests.forEach(r => document.querySelector('#table tbody').innerHTML += '<tr><td>' + r.businessName + '</td><td>' + r.packageType + '</td><td>' + r.amount.toLocaleString() + '</td></tr>');
    }
    function logout() { localStorage.removeItem('token'); window.location.href = '/'; }
    load();
  </script>
</body>
</html>`);
});

app.get('/admin.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>Admin</title>
  <style>
    body { font-family: Tahoma; background: #f5f5f5; }
    .nav { background: #0052cc; color: white; padding: 20px; text-align: center; }
    .container { max-width: 1000px; margin: 20px auto; padding: 20px; }
    .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: right; border-bottom: 1px solid #ddd; }
    .btn-approve { background: #4CAF50; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; }
    .btn-logout { padding: 10px 20px; background: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="nav"><h1>Admin Dashboard</h1></div>
  <div class="container">
    <div class="card">
      <h2>Pending Requests</h2>
      <table id="table"><thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>Amount</th><th>Action</th></tr></thead><tbody></tbody></table>
    </div>
    <button class="btn-logout" onclick="logout()">Logout</button>
  </div>
  <script>
    async function load() {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/pending', { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await res.json();
      data.forEach(r => {
        document.querySelector('#table tbody').innerHTML += '<tr><td>' + r.businessName + '</td><td>' + r.businessPhone + '</td><td>' + r.businessAddress + '</td><td>' + r.amount.toLocaleString() + '</td><td><button class="btn-approve" onclick="approve(\'' + r.refId + '\')">Approve</button></td></tr>';
      });
    }
    async function approve(refId) {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/approve-payment', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refId })
      });
      const data = await res.json();
      if (data.success) {
        alert('Approved!');
        location.reload();
      }
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
  <title>Directory</title>
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
  <div class="nav"><h1>Directory</h1></div>
  <div class="container"><div class="grid" id="grid"></div></div>
  <script>
    async function load() {
      const res = await fetch('/api/directory');
      const data = await res.json();
      if (data.length === 0) {
        document.getElementById('grid').innerHTML = '<p>No approved listings</p>';
        return;
      }
      data.forEach(b => document.getElementById('grid').innerHTML += '<div class="card"><h3>' + b.businessName + '</h3><p>' + b.businessAddress + '</p><p>Phone: ' + b.businessPhone + '</p></div>');
    }
    load();
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Server running');
});
