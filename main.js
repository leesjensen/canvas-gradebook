const fs = require('fs');
const { Parser } = require('json2csv');
const config = require('./config');

async function fetchGradebook() {
  try {
    let url = `${config.canvas.url}/courses/${config.canvas.course}/users?enrollment_type=student&include[]=enrollments&per_page=10`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.canvas.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const studentsData = await response.json();

      const students = studentsData.map((student) => {
        const enrollment = student.enrollments?.[0] || {};
        return {
          id: student.id,
          name: student.name,
          sortable_name: student.sortable_name,
          grade: enrollment.grades?.current_grade || 'N/A',
          score: enrollment.grades?.current_score || 'N/A',
        };
      });

      const parser = new Parser();
      const csv = parser.parse(students);
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
