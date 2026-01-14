# canvas-gradebook

Grabs the canvas gradebook once a day and computes statistics

## Installation

```sh
npm clone https://github.com/leesjensen/canvas-gradebook.git
npm install
```

## Configuration

### Access token

Get a Canvas API Access Token.

1. Open Canvas
1. Open your profile by clicking on your user image
1. Select `Settings`
1. Select `+ New Access Token`

![alt text](createAccessToken.png)

### Config.js

Create a `config.js` file in the root of the project. Replace the values given below with your Canvas URL, course, and API Access Token.

```js
export default {
  canvas: {
    url: 'https://canvas.instructure.com/api/v1',
    course: '99999',
    token: 'xyz',
  },
};
```

### Execute

Run `node main.js`. This will produce a CVS file containing a summary of submission information for the current grade book. Each time you run it, it will add the latest submission summary for each assignment.

```csv
"date","assignment","userCount","submissionPercent","latePercent","averageGrade"
"1/14/2026, 4:07:06 PM","Demo day submission",158,0,0,0
"1/14/2026, 4:07:06 PM","Startup AWS",158,0.04,0,1
"1/14/2026, 4:07:06 PM","Startup CSS",158,0,0,0
"1/14/2026, 4:07:06 PM","Startup DB",158,0,0,0
"1/14/2026, 4:07:06 PM","Startup HTML",158,0.01,0,0.95
"1/14/2026, 4:07:06 PM","Startup React Phase 1: React Routing",158,0,0,0
"1/14/2026, 4:07:06 PM","Startup React Phase 2: Reactivity",158,0,0,0
"1/14/2026, 4:07:06 PM","Startup Service",158,0,0,0
"1/14/2026, 4:07:06 PM","Startup WebSocket",158,0,0,0
"1/14/2026, 4:07:06 PM","Startup specification",158,0.63,0,0.98
"1/14/2026, 4:07:06 PM","Student Rating Survey",158,0,0,0
"1/14/2026, 4:07:06 PM","Grace days",158,0,0,0

```

Use `--repeat` to cause it to repeat every 24 hours.

### Deployment

Use PM2 to cause the program to run once a day.

```sh
pm2 start main.js -n cs260Gradebook --watch -- --repeat
```

Deploy with:

```
./deploy.sh -k <keyfile> -h <host>
```

### Analyze

Open the CSV in your favorite editor and enjoy.

![alt text](spreadsheet.png)
