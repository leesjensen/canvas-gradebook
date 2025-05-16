const { AsyncParser } = require('@json2csv/node');
const config = require('./config');
const fs = require('fs');

async function loadUsers() {
  const url = `${config.canvas.url}/courses/${config.canvas.course}/users?enrollment_type=student&enrollment_state[]=active&enrollment_state[]=inactive&include[]=enrollments&per_page=100`;
  const users = {};
  await callCanvas(url, (user) => {
    users[user.id] = {
      id: user.id,
      name: user.name,
      email: user.email,
      assignmentCount: 0,
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
      name: assignment.name,
      studentCount: 0,
      submissionCount: 0,
      lateCount: 0,
      possiblePoints: assignment.points_possible,
      totalStudentPoints: 0,
    };
  });

  return assignments;
}

async function processSubmissions() {
  const users = await loadUsers();
  const assignments = await loadAssignments();

  try {
    let url = `${config.canvas.url}/courses/${config.canvas.course}/students/submissions?workflow_state=graded&student_ids[]=all&per_page=100`;
    await callCanvas(url, (e) => {
      const user = users[e.user_id];
      if (user) {
        const done = e.missing ? 0 : 1;
        user.assignmentCount += done;

        const assignment = assignments[e.assignment_id];
        if (assignment) {
          assignment.studentCount++;
          assignment.submissionCount += done;
          assignment.lateCount += e.late ? 1 : 0;
          assignment.totalStudentPoints += e.score ?? 0;
        }
      }
    });

    const results = collateResults(assignments);
    writeResults(results);
  } catch (error) {
    console.error('Error fetching gradebook:', error.message);
  }
}

function formatNum(condition, value) {
  return condition ? parseFloat(value.toFixed(2)) : 0;
}

function collateResults(assignments) {
  const dateHeader = new Date().toLocaleString();
  return Object.values(assignments).map((assignment) => {
    const averageGrade = formatNum(assignment.possiblePoints && assignment.studentCount, assignment.totalStudentPoints / assignment.studentCount / assignment.possiblePoints);
    const submissionPercent = formatNum(assignment.studentCount, assignment.submissionCount / assignment.studentCount);
    const latePercent = formatNum(assignment.studentCount, assignment.lateCount / assignment.studentCount);
    return {
      date: dateHeader,
      assignment: assignment.name,
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
  }
}

function getNextUrl(response) {
  const header = response.headers.get('link');
  if (!header) return null;

  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

processSubmissions();

// const period = 24 * 60 * 60 * 1000;
// setInterval(() => {
//   processSubmissions();
// }, period);
