const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

// ---- CONFIG ----
const CONFIG_PATH = process.argv[2] || 'config.json';

function loadConfig() {
  const config = require(`./${CONFIG_PATH}`);

  if (!config.courseUrl || !config.startDate || !config.endDate || !config.apiKey) {
    console.error('Config must include: courseUrl, startDate, endDate, apiKey');
    process.exit(1);
  }

  return config;
}

// ---- FETCH HELPERS ----
async function fetchAllPages(url, apiKey) {
  let results = [];
  let nextUrl = url;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    const text = await res.text();
    const data = JSON.parse(text);

    results = results.concat(data);

    const link = res.headers.get('link');
    nextUrl = null;

    if (link) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) nextUrl = match[1];
    }
  }

  return results;
}

// ---- API ----
async function getAssignments(config) {
  const url = `${config.courseUrl}/assignments?per_page=100`;
  return fetchAllPages(url, config.apiKey);
}

async function getEnrollments(config) {
  const url = `${config.courseUrl}/enrollments?type[]=StudentEnrollment&per_page=100`;
  return fetchAllPages(url, config.apiKey);
}

async function getAllSubmissions(config) {
  const url = `${config.courseUrl}/students/submissions?student_ids[]=all&per_page=100&include[]=submission_history`;
  return fetchAllPages(url, config.apiKey);
}

// ---- BUILD DATA ----
function buildAssignmentData(submissions, assignments) {
  const assignmentMap = {};

  assignments.forEach((a) => {
    assignmentMap[String(a.id)] = {
      id: a.id,
      name: a.name,
      submissions: {},
    };
  });

  submissions.forEach((sub) => {
    const assignment = assignmentMap[String(sub.assignment_id)];
    if (!assignment) return;

    let latest = null;

    if (sub.submission_history) {
      sub.submission_history.forEach((attempt) => {
        if (attempt.submitted_at) {
          const d = dayjs(attempt.submitted_at);
          if (!latest || d.isAfter(latest)) latest = d;
        }
      });
    }

    if (sub.submitted_at) {
      const d = dayjs(sub.submitted_at);
      if (!latest || d.isAfter(latest)) latest = d;
    }

    if (latest) {
      assignment.submissions[sub.user_id] = latest;
    }
  });

  return Object.values(assignmentMap);
}

// ---- DATE RANGE ----
function generateDates(start, end) {
  const dates = [];
  let current = dayjs(start);
  const last = dayjs(end);

  while (current.isBefore(last) || current.isSame(last)) {
    dates.push(current);
    current = current.add(1, 'day');
  }

  return dates;
}

// ---- TABLE ----
function computeTable(assignmentsData, studentIds, dates) {
  return dates.map((date) => {
    const row = {
      date: date.format('MMM/DD/YYYY'),
    };

    assignmentsData.forEach((a) => {
      const submitted = studentIds.filter((id) => {
        const d = a.submissions[id];
        if (!d) return false;
        return d.isBefore(date) || d.isSame(date);
      }).length;

      row[a.name] = Math.round((submitted / studentIds.length) * 100);
    });

    return row;
  });
}

// ---- CSV OUTPUT ----
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function writeCsv(config, table, assignments) {
  const courseIdMatch = config.courseUrl.match(/courses\/(\d+)/);
  const courseId = courseIdMatch ? courseIdMatch[1] : 'course';

  const safeStart = dayjs(config.startDate).format('YYYY-MM-DD');
  const safeEnd = dayjs(config.endDate).format('YYYY-MM-DD');

  const fileName = `${courseId}-${safeStart}-${safeEnd}.csv`;
  const filePath = path.resolve(fileName);

  const headers = ['Date', ...assignments.map((a) => a.name)];
  const lines = [headers.map(csvEscape).join(', ')];

  table.forEach((row) => {
    const values = [csvEscape(row.date), ...assignments.map((a) => row[a.name] ?? 0)];
    lines.push(values.join(', '));
  });

  fs.writeFileSync(filePath, lines.join('\n'));

  console.log(`CSV written to ${filePath}`);
}

// ---- SUMMARY ----
function printSummaryStats(active, inactive, assignmentsData) {
  const total = active.length + inactive.length;

  const hasAny = (id) => assignmentsData.some((a) => a.submissions[id]);
  const hasAll = (id) => assignmentsData.every((a) => a.submissions[id]);

  const activeStats = {
    any: active.filter(hasAny).length,
    all: active.filter(hasAll).length,
    none: active.filter((id) => !hasAny(id)).length,
  };

  const inactiveStats = {
    started: inactive.filter(hasAny).length,
    none: inactive.filter((id) => !hasAny(id)).length,
  };

  const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));

  console.log('\n===== Course Summary =====');
  console.log(`Total students: ${total}`);
  console.log(`Active: ${active.length}`);
  console.log(`Inactive: ${inactive.length}`);

  console.log('\n--- Active ---');
  console.log(`Started: ${pct(activeStats.any, active.length)}%`);
  console.log(`Completed all: ${pct(activeStats.all, active.length)}%`);
  console.log(`Never started: ${pct(activeStats.none, active.length)}%`);

  console.log('\n--- Inactive ---');
  console.log(`Dropped after starting: ${pct(inactiveStats.started, inactive.length)}%`);
  console.log(`Dropped without starting: ${pct(inactiveStats.none, inactive.length)}%`);
}

// ---- MAIN ----
async function main() {
  const config = loadConfig();

  console.log('Fetching assignments...');
  const assignments = await getAssignments(config);
  console.log(`Assignments fetched: ${assignments.length}`);

  const filteredAssignments = config.includeAssignments?.length ? assignments.filter((a) => config.includeAssignments.includes(a.name)) : assignments;

  console.log('Fetching enrollments...');
  const enrollments = await getEnrollments(config);

  const active = enrollments.filter((e) => e.enrollment_state === 'active').map((e) => e.user_id);

  const inactive = enrollments.filter((e) => e.enrollment_state !== 'active').map((e) => e.user_id);

  console.log('Fetching ALL submissions...');
  const submissions = await getAllSubmissions(config);

  console.log(`Fetched ${submissions.length} submissions`);

  const uniqueUsers = new Set(submissions.map((s) => s.user_id));
  const uniqueAssignments = new Set(submissions.map((s) => s.assignment_id));

  console.log(`Unique users in submissions: ${uniqueUsers.size}`);
  console.log(`Unique assignments in submissions: ${uniqueAssignments.size}`);

  const assignmentsData = buildAssignmentData(submissions, assignments);

  const filteredData = assignmentsData.filter((a) => filteredAssignments.some((f) => f.id === a.id));

  const dates = generateDates(config.startDate, config.endDate);

  const allStudents = [...new Set([...active, ...inactive])];
  const table = computeTable(filteredData, allStudents, dates);

  // ✅ CSV output restored
  writeCsv(config, table, filteredData);

  printSummaryStats(active, inactive, filteredData);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
