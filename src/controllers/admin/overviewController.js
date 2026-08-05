/**
 * Admin Overview — aggregated marketplace stats for dashboard charts
 */

const State = require('../../models/State');
const District = require('../../models/District');
const Provider = require('../../models/Provider');
const JobCard = require('../../models/JobCard');
const User = require('../../models/User');
const {ensureGeographySeeded} = require('../../utils/geographySeed');

function emptyJobStatus() {
  return {
    pending: 0,
    unassigned: 0,
    accepted: 0,
    'in-progress': 0,
    completed: 0,
    cancelled: 0,
  };
}

function applyJobStatusRows(target, rows) {
  for (const row of rows) {
    const key = row._id || '';
    const n = row.count || 0;
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] += n;
    } else if (key === 'pending' || key === 'unassigned') {
      target[key] = (target[key] || 0) + n;
    }
  }
  return target;
}

function idKey(id) {
  return id == null ? '' : String(id);
}

function clampTrendDays(raw) {
  const n = Number.parseInt(String(raw || '30'), 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(7, n));
}

function utcDayString(date) {
  return date.toISOString().slice(0, 10);
}

function eachUtcDay(start, days) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(utcDayString(d));
  }
  return out;
}

function rowsToMap(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row._id) map.set(String(row._id), row.count || 0);
  }
  return map;
}

async function buildGrowthTrend(days) {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate() - (days - 1),
    0,
    0,
    0,
    0,
  ));

  const dayExpr = {
    $dateToString: {
      format: '%Y-%m-%d',
      date: '$createdAt',
      timezone: 'UTC',
    },
  };

  const [
    providerDailyRows,
    customerDailyRows,
    jobDailyRows,
  ] = await Promise.all([
    Provider.aggregate([
      {$match: {createdAt: {$gte: start, $lte: end}}},
      {$group: {_id: dayExpr, count: {$sum: 1}}},
    ]),
    User.aggregate([
      {
        $match: {
          role: 'customer',
          createdAt: {$gte: start, $lte: end},
        },
      },
      {$group: {_id: dayExpr, count: {$sum: 1}}},
    ]),
    JobCard.aggregate([
      {$match: {createdAt: {$gte: start, $lte: end}}},
      {$group: {_id: dayExpr, count: {$sum: 1}}},
    ]),
  ]);

  const providerMap = rowsToMap(providerDailyRows);
  const customerMap = rowsToMap(customerDailyRows);
  const jobMap = rowsToMap(jobDailyRows);
  const dayKeys = eachUtcDay(start, days);

  const daily = dayKeys.map((date) => ({
    date,
    providers: providerMap.get(date) || 0,
    customers: customerMap.get(date) || 0,
    jobs: jobMap.get(date) || 0,
  }));

  return {
    days,
    startDate: dayKeys[0] || null,
    endDate: dayKeys[dayKeys.length - 1] || null,
    daily,
  };
}

/**
 * GET /api/admin/overview/stats
 * Optional query: stateId — when set, includes districtRows for that state
 * Optional query: days — trend window (7–90, default 30)
 */
exports.getOverviewStats = async (req, res, next) => {
  try {
    await ensureGeographySeeded();

    const stateIdFilter = (req.query.stateId || '').trim();
    const trendDays = clampTrendDays(req.query.days);

    const [
      providerStatusRows,
      customerTotal,
      jobStatusRows,
      providerServiceRows,
      jobServiceRows,
      providerByStateRows,
      customerByStateRows,
      jobByStateRows,
      states,
      growthTrend,
    ] = await Promise.all([
      Provider.aggregate([
        {$group: {_id: '$approvalStatus', count: {$sum: 1}}},
      ]),
      User.countDocuments({role: 'customer'}),
      JobCard.aggregate([{$group: {_id: '$status', count: {$sum: 1}}}]),
      Provider.aggregate([
        {
          $group: {
            _id: {$ifNull: ['$serviceType', 'Unknown']},
            count: {$sum: 1},
          },
        },
        {$sort: {count: -1}},
        {$limit: 20},
      ]),
      JobCard.aggregate([
        {
          $group: {
            _id: {$ifNull: ['$serviceType', 'Unknown']},
            count: {$sum: 1},
          },
        },
        {$sort: {count: -1}},
        {$limit: 20},
      ]),
      Provider.aggregate([
        {
          $match: {
            'location.stateId': {$exists: true, $nin: [null, '']},
          },
        },
        {$group: {_id: '$location.stateId', count: {$sum: 1}}},
      ]),
      User.aggregate([
        {
          $match: {
            role: 'customer',
            $or: [
              {'homeAddress.stateId': {$exists: true, $nin: [null, '']}},
              {'location.stateId': {$exists: true, $nin: [null, '']}},
            ],
          },
        },
        {
          $project: {
            sid: {
              $cond: [
                {
                  $and: [
                    {$ne: [{$ifNull: ['$homeAddress.stateId', '']}, '']},
                    {$ne: [{$ifNull: ['$homeAddress.stateId', null]}, null]},
                  ],
                },
                '$homeAddress.stateId',
                '$location.stateId',
              ],
            },
          },
        },
        {$match: {sid: {$exists: true, $nin: [null, '']}}},
        {$group: {_id: '$sid', count: {$sum: 1}}},
      ]),
      JobCard.aggregate([
        {
          $match: {
            stateId: {$exists: true, $nin: [null, '']},
          },
        },
        {
          $group: {
            _id: {stateId: '$stateId', status: '$status'},
            count: {$sum: 1},
          },
        },
      ]),
      State.find({isActive: {$ne: false}}).sort({name: 1}).lean(),
      buildGrowthTrend(trendDays),
    ]);

    const providers = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const row of providerStatusRows) {
      const key = row._id || 'pending';
      const n = row.count || 0;
      providers.total += n;
      if (key === 'pending') providers.pending += n;
      else if (key === 'approved') providers.approved += n;
      else if (key === 'rejected') providers.rejected += n;
      else providers.pending += n;
    }

    const jobsByStatus = emptyJobStatus();
    applyJobStatusRows(jobsByStatus, jobStatusRows);
    const jobsTotal = Object.values(jobsByStatus).reduce((a, b) => a + b, 0);

    const stateNameById = new Map(
      states.map((s) => [idKey(s._id), s.name || idKey(s._id)]),
    );

    const providersByState = new Map(
      providerByStateRows.map((r) => [idKey(r._id), r.count || 0]),
    );
    const customersByState = new Map(
      customerByStateRows.map((r) => [idKey(r._id), r.count || 0]),
    );

    const jobsAggByState = new Map();
    for (const row of jobByStateRows) {
      const sid = idKey(row._id?.stateId);
      if (!sid) continue;
      if (!jobsAggByState.has(sid)) {
        jobsAggByState.set(sid, {...emptyJobStatus(), total: 0});
      }
      const bucket = jobsAggByState.get(sid);
      const status = row._id?.status || '';
      const n = row.count || 0;
      bucket.total += n;
      if (Object.prototype.hasOwnProperty.call(bucket, status)) {
        bucket[status] += n;
      }
    }

    const allStateIds = new Set([
      ...providersByState.keys(),
      ...customersByState.keys(),
      ...jobsAggByState.keys(),
      ...states.map((s) => idKey(s._id)),
    ]);

    const byState = [];
    for (const sid of allStateIds) {
      const name = stateNameById.get(sid) || sid;
      const providerCount = providersByState.get(sid) || 0;
      const customerCount = customersByState.get(sid) || 0;
      const jobBucket = jobsAggByState.get(sid) || {
        ...emptyJobStatus(),
        total: 0,
      };
      if (
        !stateNameById.has(sid) &&
        providerCount === 0 &&
        customerCount === 0 &&
        jobBucket.total === 0
      ) {
        continue;
      }
      byState.push({
        stateId: sid,
        name,
        providers: providerCount,
        customers: customerCount,
        jobs: jobBucket.total,
        jobStatus: {
          pending: jobBucket.pending,
          unassigned: jobBucket.unassigned,
          accepted: jobBucket.accepted,
          inProgress: jobBucket['in-progress'],
          completed: jobBucket.completed,
          cancelled: jobBucket.cancelled,
        },
      });
    }

    byState.sort((a, b) => {
      const scoreA = a.jobs + a.providers + a.customers;
      const scoreB = b.jobs + b.providers + b.customers;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return String(a.name).localeCompare(String(b.name));
    });

    const byServiceMap = new Map();
    for (const row of providerServiceRows) {
      const name = row._id || 'Unknown';
      const prev = byServiceMap.get(name) || {serviceType: name, providers: 0, jobs: 0};
      prev.providers = row.count || 0;
      byServiceMap.set(name, prev);
    }
    for (const row of jobServiceRows) {
      const name = row._id || 'Unknown';
      const prev = byServiceMap.get(name) || {serviceType: name, providers: 0, jobs: 0};
      prev.jobs = row.count || 0;
      byServiceMap.set(name, prev);
    }
    const byService = [...byServiceMap.values()].sort(
      (a, b) => b.jobs + b.providers - (a.jobs + a.providers),
    );

    let byDistrict = [];
    if (stateIdFilter) {
      const districts = await District.find({
        stateId: stateIdFilter,
        isActive: {$ne: false},
      })
        .sort({name: 1})
        .lean();

      const [
        providerByDistrictRows,
        customerByDistrictRows,
        jobByDistrictRows,
      ] = await Promise.all([
        Provider.aggregate([
          {
            $match: {
              'location.stateId': stateIdFilter,
              'location.districtId': {$exists: true, $nin: [null, '']},
            },
          },
          {$group: {_id: '$location.districtId', count: {$sum: 1}}},
        ]),
        User.aggregate([
          {
            $match: {
              role: 'customer',
              $or: [
                {'homeAddress.stateId': stateIdFilter},
                {'location.stateId': stateIdFilter},
              ],
            },
          },
          {
            $project: {
              did: {
                $cond: [
                  {
                    $and: [
                      {$ne: [{$ifNull: ['$homeAddress.districtId', '']}, '']},
                      {$ne: [{$ifNull: ['$homeAddress.districtId', null]}, null]},
                    ],
                  },
                  '$homeAddress.districtId',
                  '$location.districtId',
                ],
              },
            },
          },
          {$match: {did: {$exists: true, $nin: [null, '']}}},
          {$group: {_id: '$did', count: {$sum: 1}}},
        ]),
        JobCard.aggregate([
          {
            $match: {
              stateId: stateIdFilter,
              districtId: {$exists: true, $nin: [null, '']},
            },
          },
          {
            $group: {
              _id: {districtId: '$districtId', status: '$status'},
              count: {$sum: 1},
            },
          },
        ]),
      ]);

      const providersByDistrict = new Map(
        providerByDistrictRows.map((r) => [idKey(r._id), r.count || 0]),
      );
      const customersByDistrict = new Map(
        customerByDistrictRows.map((r) => [idKey(r._id), r.count || 0]),
      );
      const jobsAggByDistrict = new Map();
      for (const row of jobByDistrictRows) {
        const did = idKey(row._id?.districtId);
        if (!did) continue;
        if (!jobsAggByDistrict.has(did)) {
          jobsAggByDistrict.set(did, {...emptyJobStatus(), total: 0});
        }
        const bucket = jobsAggByDistrict.get(did);
        const status = row._id?.status || '';
        const n = row.count || 0;
        bucket.total += n;
        if (Object.prototype.hasOwnProperty.call(bucket, status)) {
          bucket[status] += n;
        }
      }

      const districtNameById = new Map(
        districts.map((d) => [idKey(d._id), d.name || idKey(d._id)]),
      );
      const allDistrictIds = new Set([
        ...districts.map((d) => idKey(d._id)),
        ...providersByDistrict.keys(),
        ...customersByDistrict.keys(),
        ...jobsAggByDistrict.keys(),
      ]);

      for (const did of allDistrictIds) {
        const name = districtNameById.get(did) || did;
        const providerCount = providersByDistrict.get(did) || 0;
        const customerCount = customersByDistrict.get(did) || 0;
        const jobBucket = jobsAggByDistrict.get(did) || {
          ...emptyJobStatus(),
          total: 0,
        };
        byDistrict.push({
          districtId: did,
          name,
          providers: providerCount,
          customers: customerCount,
          jobs: jobBucket.total,
          jobStatus: {
            pending: jobBucket.pending,
            unassigned: jobBucket.unassigned,
            accepted: jobBucket.accepted,
            inProgress: jobBucket['in-progress'],
            completed: jobBucket.completed,
            cancelled: jobBucket.cancelled,
          },
        });
      }

      byDistrict.sort((a, b) => {
        const scoreA = a.jobs + a.providers + a.customers;
        const scoreB = b.jobs + b.providers + b.customers;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(a.name).localeCompare(String(b.name));
      });
    }

    const windowProviders = growthTrend.daily.reduce(
      (s, d) => s + d.providers,
      0,
    );
    const windowCustomers = growthTrend.daily.reduce(
      (s, d) => s + d.customers,
      0,
    );
    const windowJobs = growthTrend.daily.reduce((s, d) => s + d.jobs, 0);

    let cumProviders = Math.max(0, providers.total - windowProviders);
    let cumCustomers = Math.max(0, customerTotal - windowCustomers);
    let cumJobs = Math.max(0, jobsTotal - windowJobs);

    const trend = {
      days: growthTrend.days,
      startDate: growthTrend.startDate,
      endDate: growthTrend.endDate,
      points: growthTrend.daily.map((d) => {
        cumProviders += d.providers;
        cumCustomers += d.customers;
        cumJobs += d.jobs;
        return {
          date: d.date,
          providers: d.providers,
          customers: d.customers,
          jobs: d.jobs,
          providersCumulative: cumProviders,
          customersCumulative: cumCustomers,
          jobsCumulative: cumJobs,
          reachCumulative: cumProviders + cumCustomers,
          reach: d.providers + d.customers,
        };
      }),
    };

    res.json({
      success: true,
      data: {
        providers,
        customers: {total: customerTotal},
        jobs: {
          total: jobsTotal,
          byStatus: {
            pending: jobsByStatus.pending,
            unassigned: jobsByStatus.unassigned,
            accepted: jobsByStatus.accepted,
            inProgress: jobsByStatus['in-progress'],
            completed: jobsByStatus.completed,
            cancelled: jobsByStatus.cancelled,
          },
        },
        byState,
        byDistrict,
        byService,
        trend,
        selectedStateId: stateIdFilter || null,
      },
    });
  } catch (err) {
    next(err);
  }
};
