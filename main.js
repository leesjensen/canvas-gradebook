const { AsyncParser } = require('@json2csv/node');
const config = require('./config');
const fs = require('fs');

async function loadUsers(assignments) {
  const url = `${config.canvas.url}/courses/${config.canvas.course}/users?enrollment_type=student&enrollment_state[]=active&enrollment_state[]=inactive&include[]=enrollments&per_page=100`;
  const users = {};
  await callCanvas(url, (user) => {
    users[user.id] = {
      id: user.id,
      name: user.name,
      email: user.email,
      assignmentCount: 0,
      assignments: Object.fromEntries(Object.entries(assignments).map(([key, value]) => [key, { id: key, done: 0, attempt: 0 }])),
    };
  });

  return users;
}

async function loadAssignments() {
  const url = `${config.canvas.url}/courses/${config.canvas.course}/assignments?per_page=100`;
  const assignments = {};
  await callCanvas(url, (assignment) => {
    assignments[assignment.id] = {
      id: assignment.id,
      possiblePoints: assignment.points_possible,
      name: assignment.name,
      submissionCount: 0,
      lateCount: 0,
      totalStudentPoints: 0,
    };
  });

  return assignments;
}

async function processSubmissions() {
  const assignments = await loadAssignments();
  const users = await loadUsers(assignments);

  if (Object.keys(assignments).length === 0 || Object.keys(users).length === 0) return;

  try {
    let url = `${config.canvas.url}/courses/${config.canvas.course}/students/submissions?workflow_state=graded&student_ids[]=all&per_page=50`;
    await callCanvas(url, (e) => {
      const user = users[e.user_id];
      if (user) {
        if (user.assignments[e.assignment_id].attempt < e.attempt) {
          user.assignments[e.assignment_id] = { id: e.assignment_id, attempt: e.attempt, done: e.missing ? 0 : 1, late: e.late, score: e.score };
        }
      }
    });

    const results = collateResults(users, assignments);
    writeResults(results);
    console.log(`Processed ${config.canvas.course}, ${Object.keys(users).length} users and ${Object.keys(assignments).length} assignments.`);
  } catch (error) {
    console.error('Error fetching gradebook:', error.message);
  }
}

function formatNum(condition, value) {
  return condition ? parseFloat(value.toFixed(2)) : 0;
}

function collateResults(users, assignments) {
  const userCount = Object.keys(users).length;
  const dateHeader = new Date().toLocaleString();
  return Object.values(assignments).map((assignment) => {
    Object.values(users).forEach((user) => {
      const userAssignment = user.assignments[assignment.id];
      if (userAssignment && userAssignment.done) {
        assignment.submissionCount += 1;
        assignment.lateCount += userAssignment.late ? 1 : 0;
        assignment.totalStudentPoints += userAssignment.score || 0;
      }
    }, 0);

    const averageGrade = formatNum(assignment.possiblePoints && assignment.submissionCount, assignment.totalStudentPoints / assignment.submissionCount / assignment.possiblePoints);
    const submissionPercent = formatNum(userCount, assignment.submissionCount / userCount);
    const latePercent = formatNum(userCount, assignment.lateCount / userCount);
    return {
      date: dateHeader,
      assignment: assignment.name,
      userCount: userCount,
      submissionPercent: submissionPercent,
      latePercent: latePercent,
      averageGrade: averageGrade,
    };
  });
}

async function writeResults(results) {
  const filename = `gradebook-${config.canvas.course}.csv`;
  const fileExists = fs.existsSync(filename);
  const parser = new AsyncParser({ header: !fileExists }, {}, {});
  const csv = await parser.parse(results).promise();
  fs.appendFileSync(filename, csv + '\n', 'utf8');
}

async function callCanvas(url, processCallback) {
  console.log(`\n-----------------------\nStarting fetch from URL: ${url}`);
  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.canvas.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    data.forEach(processCallback);

    url = getNextUrl(response);
    console.log(`Fetched ${data.length} records, next URL: ${url}`);
  }
}

function getNextUrl(response) {
  const header = response.headers.get('link');
  if (!header) return null;

  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

processSubmissions();
