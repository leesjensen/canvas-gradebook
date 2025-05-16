const { AsyncParser } = require('@json2csv/node');
const config = require('./config');
const fs = require('fs');

async function loadUsers() {
  let url = `${config.canvas.url}/courses/${config.canvas.course}/users?enrollment_type=student&enrollment_state[]=active&enrollment_state[]=inactive&include[]=enrollments&per_page=100`;
  const users = {};

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
    data.forEach((e) => {
      users[e.id] = {
        id: e.id,
        name: e.name,
        email: e.email,
        assignmentCount: 0,
      };
    });

    url = getNextUrl(response);
  }

  return users;
}

async function loadAssignments() {
  const url = `${config.canvas.url}/courses/${config.canvas.course}/assignments?per_page=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.canvas.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch assignments: ${await response.text()}`);
  }

  const data = await response.json();
  const assignments = {};
  for (const assignment of data) {
    assignments[assignment.id] = {
      id: assignment.id,
      name: assignment.name,
      studentCount: 0,
      submissionCount: 0,
      lateCount: 0,
      possiblePoints: assignment.points_possible,
      totalStudentPoints: 0,
    };
  }
  return assignments;
}

async function processSubmissions() {
  const users = await loadUsers();
  const assignments = await loadAssignments();

  try {
    let url = `${config.canvas.url}/courses/${config.canvas.course}/students/submissions?workflow_state=graded&student_ids[]=all&per_page=100`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.canvas.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const assignmentData = await response.json();

      assignmentData.forEach((e) => {
        const user = users[e.user_id];
        if (user) {
          const done = e.missing ? 0 : 1;
          user.assignmentCount += done;

          const assignment = assignments[e.assignment_id];
          assignment.studentCount++;
          assignment.submissionCount += done;
          assignment.lateCount += e.late ? 1 : 0;
          assignment.totalStudentPoints += e.score || 0;
        }
      });

      url = getNextUrl(response);
    }

    const dateHeader = new Date().toLocaleString();

    const results = Object.values(assignments).map((assignment) => {
      const averageGrade = assignment.possiblePoints && assignment.studentCount ? Math.round((assignment.totalStudentPoints / assignment.studentCount / assignment.possiblePoints) * 100) / 100 : 0;
      const submissionPercent = assignment.studentCount ? Math.round((assignment.submissionCount / assignment.studentCount) * 100) / 100 : 0;
      const latePercent = assignment.studentCount ? Math.round((assignment.lateCount / assignment.studentCount) * 100) / 100 : 0;
      return {
        date: dateHeader,
        assignment: assignment.name,
        submissionPercent: submissionPercent,
        latePercent: latePercent,
        averageGrade: averageGrade,
      };
    });

    const filename = `gradebook-${config.canvas.course}.csv`;
    const fileExists = fs.existsSync(filename);
    const parser = new AsyncParser({ header: !fileExists }, {}, {});
    const csv = await parser.parse(results).promise();
    fs.appendFileSync(filename, csv + '\n', 'utf8');
    console.log(`Gradebook data appended to ${filename}`);
  } catch (error) {
    console.error('Error fetching gradebook:', error.message);
  }
}

function getNextUrl(response) {
  const header = response.headers.get('link');
  if (!header) return null;

  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

processSubmissions();

const period = 24 * 60 * 60 * 1000;
setInterval(() => {
  processSubmissions();
}, period);
