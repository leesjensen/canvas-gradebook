const fs = require('fs');
const { Parser } = require('json2csv');
const config = require('./config');

async function getCourseUserCount() {
  let url = `${config.canvas.url}/courses/${config.canvas.course}/users?enrollment_type=student&per_page=100`;
  let count = 0;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.canvas.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const users = await response.json();
    count += users.length;

    url = getNextUrl(response);
  }

  return count;
}

async function fetchAssignmentsMap() {
  const url = `${config.canvas.url}/courses/${config.canvas.course}/assignments?per_page=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.canvas.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch assignments: ${await response.text()}`);
  }

  const assignments = await response.json();
  const map = {};
  for (const assignment of assignments) {
    map[assignment.id] = assignment.name;
  }
  return map;
}

async function fetchGradebook() {
  const userCount = await getCourseUserCount();
  const assignmentMap = await fetchAssignmentsMap();

  try {
    let url = `${config.canvas.url}/courses/${config.canvas.course}/students/submissions?student_ids[]=all&per_page=10`;

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

      const assignments = assignmentData.map((e) => {
        return {
          id: e.assignment_id,
          assignment: assignmentMap[e.assignment_id] || `${e.assignment_id}`,
          user: e.user_id,
          score: e.score,
        };
      });

      const parser = new Parser();
      const csv = parser.parse(assignments);
      console.log(csv);

      url = getNextUrl(response);
    }

    // const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // const filename = `gradebook-${timestamp}.csv`;

    // fs.writeFileSync(filename, csv);
    // console.log(`Gradebook saved to ${filename}`);
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

fetchGradebook();

// const period = 24 * 60 * 60 * 1000;
// setInterval(() => {
//   fetchGradebook();
// }, period);
