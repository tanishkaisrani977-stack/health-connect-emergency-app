import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.join(dataDir, 'db.json');

const hospitalSeed = [
  { id: 'hosp-kem', name: 'KEM Hospital, Mumbai', distance: '2.1 km', beds: 14, icu: 5, trauma: true, region: 'Parel, Mumbai', location: { lat: 19.001, lng: 72.8409 } },
  { id: 'hosp-sion', name: 'Lokmanya Tilak Municipal General Hospital', distance: '4.7 km', beds: 9, icu: 3, trauma: true, region: 'Sion, Mumbai', location: { lat: 19.0432, lng: 72.8644 } },
  { id: 'hosp-jj', name: 'Sir J. J. Hospital, Mumbai', distance: '8.4 km', beds: 18, icu: 6, trauma: true, region: 'Byculla, Mumbai', location: { lat: 18.9715, lng: 72.833 } },
  { id: 'hosp-kokilaben', name: 'Kokilaben Dhirubhai Ambani Hospital', distance: '18.2 km', beds: 22, icu: 8, trauma: true, region: 'Andheri West, Mumbai', location: { lat: 19.1316, lng: 72.8256 } },
  { id: 'hosp-fortis-mulund', name: 'Fortis Hospital, Mulund', distance: '24.8 km', beds: 11, icu: 4, trauma: false, region: 'Mulund West, Mumbai', location: { lat: 19.1726, lng: 72.9561 } }
];

// This server-owned catalogue keeps official links and eligibility wording easy to review.
// It does not collect or store eligibility documents or make eligibility decisions.
const governmentSchemeSeed = [
  {
    id: 'mjpjay',
    name: 'Mahatma Jyotirao Phule Jan Arogya Yojana (MJPJAY)',
    description: 'Maharashtra\'s integrated health assurance scheme for identified secondary and tertiary hospital care through empanelled hospitals.',
    eligibility: 'Potentially relevant for Maharashtra residents. Confirm beneficiary status, eligible treatment package, and hospital empanelment with an Arogyamitra or the official portal.',
    benefits: 'The official portal describes cashless services for identified hospital treatments, with health coverage up to ₹5 lakh per family per year under the integrated scheme, subject to current official terms and packages.',
    howToApply: 'Check the official portal or speak with the Arogyamitra at an empanelled hospital. Carry only documents requested by the official service.',
    website: 'https://www.jeevandayee.gov.in/MJPJAY/index.jsp',
    appliesTo: ['all']
  },
  {
    id: 'pmjay',
    name: 'Ayushman Bharat – Pradhan Mantri Jan Arogya Yojana (AB PM-JAY)',
    description: 'A national health assurance scheme that can help eligible families access cashless treatment at empanelled hospitals.',
    eligibility: 'Eligibility is not assumed. Check the official beneficiary service, a Common Service Centre, or an empanelled hospital before relying on coverage.',
    benefits: 'For eligible beneficiaries, the National Health Authority describes health coverage up to ₹5 lakh per family per year at empanelled hospitals, subject to scheme rules and package availability.',
    howToApply: 'Use the official beneficiary service or visit a Common Service Centre or empanelled hospital to check eligibility and obtain help with the process.',
    website: 'https://beneficiary.nha.gov.in/',
    appliesTo: ['all']
  },
  {
    id: 'jssk',
    name: 'Janani Shishu Suraksha Karyakram (JSSK)',
    description: 'A National Health Mission initiative for pregnant women and sick newborns or infants using public health institutions.',
    eligibility: 'Potentially relevant for pregnancy-related emergencies when care is sought at a public health institution. Confirm available services with the receiving public facility.',
    benefits: 'The National Health Mission lists free and cashless delivery, C-section, medicines, diagnostics, blood where needed, and transport or referral support for covered public-facility care.',
    howToApply: 'Contact the receiving public health facility or an ASHA worker and ask about JSSK support and referral arrangements.',
    website: 'https://www.nhm.gov.in/index4.php?lang=1&level=0&lid=171&linkid=150',
    appliesTo: ['Pregnancy']
  }
];

const driverLocation = { lat: 19.0215, lng: 72.8476 };
const patientLocation = { lat: 19.001, lng: 72.8409 };
const demoRequests = [
  {
    id: 'demo-req-parel-critical',
    patientId: 'walk-in-parel',
    patientName: 'Neha Sharma',
    contact: '+91 98111 22334',
    driverId: null,
    status: 'Pending',
    emergencyType: 'Accident',
    priority: 'Critical',
    distance: '6.2 km',
    eta: 5,
    region: 'Parel, Mumbai',
    patientLocation: { lat: 19.006, lng: 72.8426 },
    driverLocation: { lat: 19.0215, lng: 72.8476 },
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString()
  },
  {
    id: 'demo-req-andheri-moderate',
    patientId: 'walk-in-andheri',
    patientName: 'Kabir Malhotra',
    contact: '+91 98990 77881',
    driverId: 'driver-profile-demo',
    status: 'Accepted',
    emergencyType: 'Cardiac',
    priority: 'Moderate',
    distance: '9.8 km',
    eta: 8,
    region: 'Andheri West, Mumbai',
    patientLocation: { lat: 19.1316, lng: 72.8256 },
    driverLocation: { lat: 19.1197, lng: 72.8464 },
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  }
];

const userSchema = new mongoose.Schema(
  { _id: String, name: String, email: String, password: String, role: String, phone: String },
  { timestamps: true }
);
const driverSchema = new mongoose.Schema(
  { _id: String, userId: String, name: String, licenseNumber: String, vehicleNumber: String, phone: String, status: String, location: Object, completed: Number, completedRides: Number, totalEarnings: Number, servicePoints: Number, level: String },
  { timestamps: true }
);
const requestSchema = new mongoose.Schema(
  {
    _id: String,
    patientId: String,
    patientName: String,
    contact: String,
    driverId: String,
    status: String,
    emergencyType: String,
    priority: String,
    rejectionReason: String,
    distance: String,
    eta: Number,
    patientLocation: Object,
    driverLocation: Object,
    createdAt: String
  },
  { timestamps: true }
);

let UserModel;
let DriverModel;
let RequestModel;
let mode = 'json';
let db = null;

async function seedJson() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    db = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    db.hospitals = hospitalSeed;
    db.requests = db.requests || [];
    db.drivers = db.drivers || [];
    db.drivers = db.drivers.map((driver) => driver.id === 'driver-profile-demo' ? {
      ...driver,
      licenseNumber: 'MH-042026-AMB',
      vehicleNumber: 'MH 01 AM 2047',
      location: driverLocation,
      completed: Math.max(driver.completed || 0, 16),
      completedRides: Math.max(driver.completedRides || 0, driver.completed || 0, 16),
      totalEarnings: driver.totalEarnings || 0,
      servicePoints: driver.servicePoints || 0,
      level: driver.level || 'Bronze Responder'
    } : driver);
    db.transactions = db.transactions || [];
    db.requests = db.requests.filter((item) => !['demo-req-noida-critical', 'demo-req-gurugram-moderate'].includes(item.id));
    for (const request of demoRequests) {
      if (!db.requests.some((item) => item.id === request.id)) db.requests.push(request);
    }
    await saveJson();
  } catch {
    const patientPassword = await bcrypt.hash('123456', 10);
    const driverPassword = await bcrypt.hash('123456', 10);
    db = {
      users: [
        { id: 'patient-demo', name: 'Aarav Mehta', email: 'patient@test.com', password: patientPassword, role: 'patient', phone: '+91 98765 43210' },
        { id: 'driver-demo', name: 'Rohan Singh', email: 'driver@test.com', password: driverPassword, role: 'driver', phone: '+91 99887 76655' }
      ],
      drivers: [
        {
          id: 'driver-profile-demo',
          userId: 'driver-demo',
          name: 'Rohan Singh',
          licenseNumber: 'MH-042026-AMB',
          vehicleNumber: 'MH 01 AM 2047',
          phone: '+91 99887 76655',
          status: 'ONLINE',
          location: driverLocation,
          completed: 8,
          completedRides: 8,
          totalEarnings: 0,
          servicePoints: 0,
          level: 'Bronze Responder'
        }
      ],
      requests: demoRequests,
      hospitals: hospitalSeed
    };
    await saveJson();
  }
}

async function saveJson() {
  if (mode === 'json') {
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(dataFile, JSON.stringify(db, null, 2));
    } catch (error) {
      console.warn(`JSON store is running in memory because disk write failed: ${error.message}`);
    }
  }
}

export async function initStore() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      UserModel = mongoose.model('User', userSchema);
      DriverModel = mongoose.model('Driver', driverSchema);
      RequestModel = mongoose.model('AmbulanceRequest', requestSchema);
      mode = 'mongo';
      await seedMongo();
      return { mode };
    } catch (error) {
      console.warn('MongoDB unavailable, falling back to JSON store:', error.message);
    }
  }
  mode = 'json';
  await seedJson();
  return { mode };
}

async function seedMongo() {
  const users = await UserModel.countDocuments();
  if (users > 0) return;
  const patientPassword = await bcrypt.hash('123456', 10);
  const driverPassword = await bcrypt.hash('123456', 10);
  await UserModel.create([
    { _id: 'patient-demo', name: 'Aarav Mehta', email: 'patient@test.com', password: patientPassword, role: 'patient', phone: '+91 98765 43210' },
    { _id: 'driver-demo', name: 'Rohan Singh', email: 'driver@test.com', password: driverPassword, role: 'driver', phone: '+91 99887 76655' }
  ]);
  await DriverModel.create({
    _id: 'driver-profile-demo',
    userId: 'driver-demo',
    name: 'Rohan Singh',
    licenseNumber: 'MH-042026-AMB',
    vehicleNumber: 'MH 01 AM 2047',
    phone: '+91 99887 76655',
    status: 'ONLINE',
    location: driverLocation,
    completed: 8,
    completedRides: 8,
    totalEarnings: 0,
    servicePoints: 0,
    level: 'Bronze Responder'
  });
}

const normalize = (doc) => {
  const raw = doc?.toObject ? doc.toObject() : doc;
  if (!raw) return null;
  return { ...raw, id: raw.id || raw._id?.toString() };
};

export async function findUserByEmail(email) {
  if (mode === 'mongo') return normalize(await UserModel.findOne({ email }));
  return db.users.find((user) => user.email === email) || null;
}

export async function createUser(payload) {
  const user = { id: nanoid(), ...payload, password: await bcrypt.hash(payload.password, 10) };
  if (mode === 'mongo') return normalize(await UserModel.create({ _id: user.id, ...user }));
  db.users.push(user);
  if (user.role === 'driver') {
    db.drivers.push({
      id: nanoid(),
      userId: user.id,
      name: user.name,
      licenseNumber: payload.licenseNumber || 'MH-DEMO-0001',
      vehicleNumber: payload.vehicleNumber || 'AMB-DEMO',
      phone: payload.phone,
      status: 'OFFLINE',
      location: driverLocation,
      completed: 0,
      completedRides: 0,
      totalEarnings: 0,
      servicePoints: 0,
      level: 'Bronze Responder'
    });
  }
  await saveJson();
  return user;
}

export async function getDriverByUser(userId) {
  if (mode === 'mongo') return normalize(await DriverModel.findOne({ userId }));
  return db.drivers.find((driver) => driver.userId === userId) || null;
}

export async function setDriverStatus(userId, status) {
  if (mode === 'mongo') {
    return normalize(await DriverModel.findOneAndUpdate({ userId }, { status }, { new: true }));
  }
  const driver = db.drivers.find((item) => item.userId === userId);
  if (driver) driver.status = status;
  await saveJson();
  return driver;
}

export async function listOnlineDrivers() {
  if (mode === 'mongo') return (await DriverModel.find({ status: 'ONLINE' })).map(normalize);
  return db.drivers.filter((driver) => driver.status === 'ONLINE');
}

export async function createRequest(payload) {
  const priorityEta = { Critical: 4, Moderate: 7, Normal: 11 };
  const request = {
    id: nanoid(),
    patientId: payload.patientId,
    patientName: payload.patientName,
    contact: payload.contact,
    driverId: null,
    status: 'Pending',
    emergencyType: payload.emergencyType,
    priority: payload.priority,
    distance: payload.priority === 'Critical' ? '2.1 km' : '4.6 km',
    eta: priorityEta[payload.priority] || 8,
    region: 'KEM Hospital - Parel corridor',
    patientLocation,
    driverLocation,
    createdAt: new Date().toISOString()
  };
  if (mode === 'mongo') return normalize(await RequestModel.create({ _id: request.id, ...request }));
  db.requests.unshift(request);
  await saveJson();
  return request;
}

export async function listRequestsForUser(user) {
  const sort = (items) => items.sort((a, b) => {
    const weight = { Critical: 3, Moderate: 2, Normal: 1 };
    return (weight[b.priority] || 0) - (weight[a.priority] || 0) || new Date(b.createdAt) - new Date(a.createdAt);
  });
  if (mode === 'mongo') {
    const query = user.role === 'patient' ? { patientId: user.id } : {};
    return sort((await RequestModel.find(query)).map(normalize));
  }
  const items = user.role === 'patient' ? db.requests.filter((req) => req.patientId === user.id) : db.requests;
  return sort([...items]);
}

export async function updateRequestStatus(id, status, driverUserId, reason) {
  const driver = driverUserId ? await getDriverByUser(driverUserId) : null;
  const rewardByPriority = {
    Critical: { amount: 850, points: 80 },
    Moderate: { amount: 600, points: 60 },
    Normal: { amount: 400, points: 40 }
  };
  if (mode === 'mongo') {
    const current = normalize(await RequestModel.findById(id));
    const reward = status === 'Completed' && driver && current?.status !== 'Completed' ? (rewardByPriority[current.priority] || rewardByPriority.Normal) : null;
    const patch = { status, ...(driver ? { driverId: driver.id } : {}), ...(status === 'Rejected' && reason ? { rejectionReason: reason } : {}), ...(reward ? { driverEarning: reward.amount, rewardPointsEarned: reward.points } : {}) };
    const request = normalize(await RequestModel.findOneAndUpdate({ _id: id }, patch, { new: true }));
    if (reward) {
      const servicePoints = (driver.servicePoints || 0) + reward.points;
      const level = servicePoints >= 1000 ? 'Gold Responder' : servicePoints >= 400 ? 'Silver Responder' : 'Bronze Responder';
      await DriverModel.findByIdAndUpdate(driver.id, { $inc: { completed: 1, completedRides: 1, totalEarnings: reward.amount, servicePoints: reward.points }, $set: { level } });
    }
    return request;
  }
  const request = db.requests.find((item) => item.id === id);
  const reward = status === 'Completed' && driver && request?.status !== 'Completed' ? (rewardByPriority[request.priority] || rewardByPriority.Normal) : null;
  const patch = { status, ...(driver ? { driverId: driver.id } : {}), ...(status === 'Rejected' && reason ? { rejectionReason: reason } : {}), ...(reward ? { driverEarning: reward.amount, rewardPointsEarned: reward.points } : {}) };
  if (request) Object.assign(request, patch);
  if (reward) {
    driver.completed = (driver.completed || 0) + 1;
    driver.completedRides = (driver.completedRides || driver.completed - 1) + 1;
    driver.totalEarnings = (driver.totalEarnings || 0) + reward.amount;
    driver.servicePoints = (driver.servicePoints || 0) + reward.points;
    driver.level = driver.servicePoints >= 1000 ? 'Gold Responder' : driver.servicePoints >= 400 ? 'Silver Responder' : 'Bronze Responder';
    db.transactions.unshift({ id: nanoid(), driverId: driver.id, rideId: request.id, amount: reward.amount, servicePoints: reward.points, createdAt: new Date().toISOString() });
  }
  await saveJson();
  return request;
}

export async function getDriverEarnings(userId) {
  const driver = await getDriverByUser(userId);
  if (!driver) return { driver: null, transactions: [] };
  if (mode === 'mongo') return { driver, transactions: [] };
  return { driver, transactions: db.transactions.filter((transaction) => transaction.driverId === driver.id).slice(0, 5) };
}

export async function getHospitals() {
  return mode === 'mongo' ? hospitalSeed : db.hospitals;
}

export async function getGovernmentSchemes(emergencyType) {
  return governmentSchemeSeed
    .filter((scheme) => scheme.appliesTo.includes('all') || scheme.appliesTo.includes(emergencyType))
    .map((scheme) => ({
      ...scheme,
      recommendation: scheme.appliesTo.includes(emergencyType)
        ? `Shown because this request is marked as ${emergencyType}. Eligibility is not confirmed.`
        : 'Shown as a general healthcare-support option. Eligibility is not confirmed.'
    }));
}
