/**
 * Seed India states + districts (core set; expandable later)
 * Idempotent — skips existing ids / names; backfills pincode when missing.
 */

const State = require('../models/State');
const District = require('../models/District');

/** @type {Array<{code: string, name: string, districts: Array<{name: string, pincode: string}>}>} */
const SEED = [
  {
    code: 'JH',
    name: 'Jharkhand',
    districts: [
      {name: 'Ranchi', pincode: '834001'},
      {name: 'East Singhbhum', pincode: '831001'},
      {name: 'West Singhbhum', pincode: '833201'},
      {name: 'Dhanbad', pincode: '826001'},
      {name: 'Bokaro', pincode: '827001'},
      {name: 'Hazaribagh', pincode: '825301'},
      {name: 'Giridih', pincode: '815301'},
      {name: 'Deoghar', pincode: '814112'},
      {name: 'Dumka', pincode: '814101'},
      {name: 'Palamu', pincode: '822101'},
      {name: 'Garhwa', pincode: '822114'},
      {name: 'Chatra', pincode: '825401'},
      {name: 'Koderma', pincode: '825410'},
      {name: 'Jamtara', pincode: '815351'},
      {name: 'Sahibganj', pincode: '816109'},
      {name: 'Pakur', pincode: '816107'},
      {name: 'Godda', pincode: '814133'},
      {name: 'Latehar', pincode: '829206'},
      {name: 'Simdega', pincode: '835223'},
      {name: 'Khunti', pincode: '835210'},
      {name: 'Ramgarh', pincode: '829122'},
      {name: 'Seraikela Kharsawan', pincode: '833220'},
      {name: 'Lohardaga', pincode: '835302'},
      {name: 'Gumla', pincode: '835207'},
    ],
  },
  {
    code: 'BR',
    name: 'Bihar',
    districts: [
      {name: 'Patna', pincode: '800001'},
      {name: 'Gaya', pincode: '823001'},
      {name: 'Muzaffarpur', pincode: '842001'},
      {name: 'Bhagalpur', pincode: '812001'},
      {name: 'Darbhanga', pincode: '846004'},
      {name: 'Purnia', pincode: '854301'},
      {name: 'Nalanda', pincode: '803111'},
      {name: 'Rohtas', pincode: '821305'},
      {name: 'Saran', pincode: '841301'},
      {name: 'Vaishali', pincode: '844101'},
    ],
  },
  {
    code: 'WB',
    name: 'West Bengal',
    districts: [
      {name: 'Kolkata', pincode: '700001'},
      {name: 'Howrah', pincode: '711101'},
      {name: 'North 24 Parganas', pincode: '700124'},
      {name: 'South 24 Parganas', pincode: '700145'},
      {name: 'Hooghly', pincode: '712101'},
      {name: 'Bardhaman', pincode: '713101'},
      {name: 'Paschim Medinipur', pincode: '721101'},
      {name: 'Darjeeling', pincode: '734101'},
      {name: 'Malda', pincode: '732101'},
      {name: 'Murshidabad', pincode: '742101'},
    ],
  },
  {
    code: 'MH',
    name: 'Maharashtra',
    districts: [
      {name: 'Mumbai City', pincode: '400001'},
      {name: 'Mumbai Suburban', pincode: '400050'},
      {name: 'Pune', pincode: '411001'},
      {name: 'Nagpur', pincode: '440001'},
      {name: 'Thane', pincode: '400601'},
      {name: 'Nashik', pincode: '422001'},
      {name: 'Aurangabad', pincode: '431001'},
      {name: 'Solapur', pincode: '413001'},
      {name: 'Kolhapur', pincode: '416001'},
      {name: 'Satara', pincode: '415001'},
    ],
  },
  {
    code: 'KA',
    name: 'Karnataka',
    districts: [
      {name: 'Bengaluru Urban', pincode: '560001'},
      {name: 'Bengaluru Rural', pincode: '562110'},
      {name: 'Mysuru', pincode: '570001'},
      {name: 'Mangaluru', pincode: '575001'},
      {name: 'Hubballi', pincode: '580020'},
      {name: 'Belagavi', pincode: '590001'},
      {name: 'Kalaburagi', pincode: '585101'},
      {name: 'Ballari', pincode: '583101'},
      {name: 'Tumakuru', pincode: '572101'},
      {name: 'Davanagere', pincode: '577001'},
    ],
  },
  {
    code: 'DL',
    name: 'Delhi',
    districts: [
      {name: 'Central Delhi', pincode: '110001'},
      {name: 'East Delhi', pincode: '110091'},
      {name: 'New Delhi', pincode: '110001'},
      {name: 'North Delhi', pincode: '110054'},
      {name: 'North East Delhi', pincode: '110053'},
      {name: 'North West Delhi', pincode: '110085'},
      {name: 'Shahdara', pincode: '110032'},
      {name: 'South Delhi', pincode: '110017'},
      {name: 'South East Delhi', pincode: '110019'},
      {name: 'South West Delhi', pincode: '110045'},
      {name: 'West Delhi', pincode: '110018'},
    ],
  },
  {
    code: 'UP',
    name: 'Uttar Pradesh',
    districts: [
      {name: 'Lucknow', pincode: '226001'},
      {name: 'Kanpur Nagar', pincode: '208001'},
      {name: 'Varanasi', pincode: '221001'},
      {name: 'Agra', pincode: '282001'},
      {name: 'Prayagraj', pincode: '211001'},
      {name: 'Ghaziabad', pincode: '201001'},
      {name: 'Noida', pincode: '201301'},
      {name: 'Meerut', pincode: '250001'},
      {name: 'Gorakhpur', pincode: '273001'},
      {name: 'Bareilly', pincode: '243001'},
    ],
  },
  {
    code: 'RJ',
    name: 'Rajasthan',
    districts: [
      {name: 'Jaipur', pincode: '302001'},
      {name: 'Jodhpur', pincode: '342001'},
      {name: 'Udaipur', pincode: '313001'},
      {name: 'Kota', pincode: '324001'},
      {name: 'Ajmer', pincode: '305001'},
      {name: 'Bikaner', pincode: '334001'},
      {name: 'Alwar', pincode: '301001'},
      {name: 'Bhilwara', pincode: '311001'},
      {name: 'Sikar', pincode: '332001'},
      {name: 'Pali', pincode: '306401'},
    ],
  },
  {
    code: 'GJ',
    name: 'Gujarat',
    districts: [
      {name: 'Ahmedabad', pincode: '380001'},
      {name: 'Surat', pincode: '395001'},
      {name: 'Vadodara', pincode: '390001'},
      {name: 'Rajkot', pincode: '360001'},
      {name: 'Gandhinagar', pincode: '382010'},
      {name: 'Bhavnagar', pincode: '364001'},
      {name: 'Jamnagar', pincode: '361001'},
      {name: 'Junagadh', pincode: '362001'},
      {name: 'Anand', pincode: '388001'},
      {name: 'Mehsana', pincode: '384001'},
    ],
  },
  {
    code: 'TN',
    name: 'Tamil Nadu',
    districts: [
      {name: 'Chennai', pincode: '600001'},
      {name: 'Coimbatore', pincode: '641001'},
      {name: 'Madurai', pincode: '625001'},
      {name: 'Tiruchirappalli', pincode: '620001'},
      {name: 'Salem', pincode: '636001'},
      {name: 'Tirunelveli', pincode: '627001'},
      {name: 'Erode', pincode: '638001'},
      {name: 'Vellore', pincode: '632001'},
      {name: 'Thoothukudi', pincode: '628001'},
      {name: 'Thanjavur', pincode: '613001'},
    ],
  },
];

function slugId(prefix, name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}_${slug}`;
}

/** Process-level: seed runs once; concurrent callers share the same promise. */
let seedPromise = null;
let seedDone = false;

/**
 * Ensure states/districts exist. Safe to call on every geography request.
 * Runs the heavy loop at most once per process.
 * @returns {{statesCreated: number, districtsCreated: number, districtsUpdated: number}}
 */
async function ensureGeographySeeded() {
  if (seedDone) {
    return {statesCreated: 0, districtsCreated: 0, districtsUpdated: 0};
  }
  if (seedPromise) {
    return seedPromise;
  }

  seedPromise = (async () => {
    let statesCreated = 0;
    let districtsCreated = 0;
    let districtsUpdated = 0;

    const existingStates = await State.find({})
      .select('_id name')
      .lean();
    const stateById = new Map(existingStates.map((s) => [s._id, s]));
    const stateByName = new Map(
      existingStates.map((s) => [String(s.name).toLowerCase(), s]),
    );

    const existingDistricts = await District.find({})
      .select('_id name stateId pincode')
      .lean();
    const districtById = new Map(existingDistricts.map((d) => [d._id, d]));
    const districtByStateName = new Map();
    for (const d of existingDistricts) {
      districtByStateName.set(
        `${d.stateId}::${String(d.name).toLowerCase()}`,
        d,
      );
    }

    const statesToInsert = [];
    const districtsToInsert = [];
    const districtPincodeUpdates = [];

    for (const entry of SEED) {
      const stateId = slugId('st', entry.code || entry.name);
      let state = stateById.get(stateId) || stateByName.get(entry.name.toLowerCase());
      if (!state) {
        state = {
          _id: stateId,
          name: entry.name,
          code: entry.code,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        statesToInsert.push(state);
        stateById.set(stateId, state);
        stateByName.set(entry.name.toLowerCase(), state);
        statesCreated += 1;
      }

      const sid = state._id;
      const sname = state.name || entry.name;

      for (const district of entry.districts) {
        const districtName =
          typeof district === 'string' ? district : district.name;
        const pincode =
          typeof district === 'string'
            ? ''
            : String(district.pincode || '').trim();
        const districtId = slugId('dt', `${entry.code}-${districtName}`);
        const exists =
          districtById.get(districtId) ||
          districtByStateName.get(`${sid}::${districtName.toLowerCase()}`);

        if (!exists) {
          const doc = {
            _id: districtId,
            name: districtName,
            stateId: sid,
            stateName: sname,
            pincode: pincode || undefined,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          districtsToInsert.push(doc);
          districtById.set(districtId, doc);
          districtByStateName.set(`${sid}::${districtName.toLowerCase()}`, doc);
          districtsCreated += 1;
          continue;
        }

        if (pincode && !exists.pincode) {
          districtPincodeUpdates.push({_id: exists._id, pincode});
          exists.pincode = pincode;
          districtsUpdated += 1;
        }
      }
    }

    if (statesToInsert.length) {
      await State.insertMany(statesToInsert, {ordered: false}).catch(() => {});
    }
    if (districtsToInsert.length) {
      await District.insertMany(districtsToInsert, {ordered: false}).catch(
        () => {},
      );
    }
    if (districtPincodeUpdates.length) {
      await Promise.all(
        districtPincodeUpdates.map((u) =>
          District.updateOne(
            {_id: u._id},
            {$set: {pincode: u.pincode, updatedAt: new Date()}},
          ),
        ),
      );
    }

    seedDone = true;
    return {statesCreated, districtsCreated, districtsUpdated};
  })();

  try {
    return await seedPromise;
  } catch (err) {
    seedPromise = null;
    throw err;
  }
}

/** Allow tests / admin tooling to force a re-seed on next call. */
function resetGeographySeedFlag() {
  seedDone = false;
  seedPromise = null;
}

module.exports = {
  SEED,
  ensureGeographySeeded,
  resetGeographySeedFlag,
  slugId,
};
