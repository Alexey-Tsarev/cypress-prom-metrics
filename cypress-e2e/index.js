const cypress = require('cypress')
const express = require('express');
const client = require('prom-client');
const fs = require('fs');
const path = require('path');

// Default values
const listenPort = process.env.LISTEN_PORT || 8080;
const delayTimeout = parseInt(process.env.DELAY_TIMEOUT) || 0;
const iterLimit = parseInt(process.env.ITER_LIMIT) || 1;
const pushGatewayUrl = process.env.PUSH_GATEWAY_URL || false;
const pushGatewayJobName = process.env.PUSH_GATEWAY_JOB_NAME || false;
const metricsDefaultLabelName = process.env.METRICS_DEFAULT_LABEL_NAME || false;
const metricsDefaultLabelValue = process.env.METRICS_DEFAULT_LABEL_VALUE || false;
const cypressTestsDir = process.env.CYPRESS_TESTS_DIR || "tests";
const cypressTestName = process.env.CYPRESS_TEST_NAME || false;
const cypressTestMetricsLabelName = process.env.CYPRESS_TEST_METRICS_LABEL_NAME || "test_name";

if (process.env.CYPRESS_BASE_URL === undefined)
  process.env.CYPRESS_BASE_URL = "http://localhost"
// End Default values

const pushGateway = pushGatewayUrl !== false ? new client.Pushgateway(pushGatewayUrl) : false;
const server = express();
const Registry = client.Registry;
const register = new Registry();
const Gauge = client.Gauge;

if ((metricsDefaultLabelName !== false) && (metricsDefaultLabelValue !== false)) {
  client.register.setDefaultLabels({ [metricsDefaultLabelName]: metricsDefaultLabelValue });
}

const result = new Gauge({
  name: 'result',
  help: 'result',
  labelNames: [cypressTestMetricsLabelName]
});
const startedTestsAt = new Gauge({
  name: 'startedTestsAt',
  help: 'startedTestsAt',
  labelNames: [cypressTestMetricsLabelName]
});
const endedTestsAt = new Gauge({
  name: 'endedTestsAt',
  help: 'endedTestsAt',
  labelNames: [cypressTestMetricsLabelName]
});
const totalDuration = new Gauge({
  name: 'totalDuration',
  help: 'totalDuration',
  labelNames: [cypressTestMetricsLabelName]
});
const totalSuites = new Gauge({
  name: 'totalSuites',
  help: 'totalSuites',
  labelNames: [cypressTestMetricsLabelName]
});
const totalTests = new Gauge({
  name: 'totalTests',
  help: 'totalTests',
  labelNames: [cypressTestMetricsLabelName]
});
const totalFailed = new Gauge({
  name: 'totalFailed',
  help: 'totalFailed',
  labelNames: [cypressTestMetricsLabelName]
});
const totalPassed = new Gauge({
  name: 'totalPassed',
  help: 'totalPassed',
  labelNames: [cypressTestMetricsLabelName]
});
const totalPending = new Gauge({
  name: 'totalPending',
  help: 'totalPending',
  labelNames: [cypressTestMetricsLabelName]
});
const totalSkipped = new Gauge({
  name: 'totalSkipped',
  help: 'totalSkipped',
  labelNames: [cypressTestMetricsLabelName]
});

let cypressArgs;
const getArgs = async () => {
  cypressArgs = await cypress.cli.parseRunArguments(process.argv.slice(2));
  console.log(`Command line arguments: ${process.argv}`);
  console.log(`Cypress args: ${JSON.stringify(cypressArgs)}`);
};

let tests = [];
let testsDir = [];
const getTests = async () => {
  let testsNumber = 1;
  console.log("Tests list:");
  fs.readdirSync(cypressTestsDir).forEach(file => {
    if ((cypressTestName === false) || ((cypressTestName !== false) && (file === cypressTestName))) {
      console.log(`${testsNumber}. ${file}`);
      tests.push(file);
      testsDir.push(path.join(process.cwd(), cypressTestsDir, file));
      testsNumber++;
    }
  });
  console.log("End of list");
};

let cypressTestsNumber = 1;
const callCypress = async (test_name) => {
  let r = await cypress.run(cypressArgs);
  console.log("Cypress finished with results:");
  console.log(r);

  await setMetricsFromResult(r, test_name);

  if (pushGatewayUrl !== false) {
    console.log(`Send data to PushGateway: ${pushGatewayUrl}`);

    await pushGateway
      .push(
        // { jobName: pushGatewayJobName }
        { jobName: pushGatewayJobName + cypressTestsNumber }
      )
      .then(({ resp }) => {
        console.log(`PushGateway response code: ${resp.statusCode}`);
      })
      .catch((err) => {
        console.error(`PushGateway error: ${err}`);
      });
  }

  cypressTestsNumber++;
  console.log("Cypress test completed");
}

const setMetricsFromResult = async (r, test_name) => {
  switch (r.status) {
    case "finished":
      result.set({ [cypressTestMetricsLabelName]: test_name }, 1);
      startedTestsAt.set({ [cypressTestMetricsLabelName]: test_name }, new Date(r.startedTestsAt).getTime());
      endedTestsAt.set({ [cypressTestMetricsLabelName]: test_name }, new Date(r.endedTestsAt).getTime());
      totalDuration.set({ [cypressTestMetricsLabelName]: test_name }, r.totalDuration);
      totalSuites.set({ [cypressTestMetricsLabelName]: test_name }, r.totalSuites);
      totalTests.set({ [cypressTestMetricsLabelName]: test_name }, r.totalTests);
      totalFailed.set({ [cypressTestMetricsLabelName]: test_name }, r.totalFailed);
      totalPassed.set({ [cypressTestMetricsLabelName]: test_name }, r.totalPassed);
      totalPending.set({ [cypressTestMetricsLabelName]: test_name }, r.totalPending);
      totalSkipped.set({ [cypressTestMetricsLabelName]: test_name }, r.totalSkipped);

      break;
    default:
      result.set({ [cypressTestMetricsLabelName]: test_name }, 0);
      startedTestsAt.reset();
      endedTestsAt.reset();
      totalDuration.reset();
      totalSuites.reset();
      totalTests.reset();
      totalFailed.reset();
      totalPassed.reset();
      totalPending.reset();
      totalSkipped.reset();

      break;
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

(async () => {
  await getArgs();
  await getTests();

  server.listen(listenPort);
  console.log(`Server is listening on '${listenPort}' port, metrics are exposed on '/metrics' endpoint`);

  server.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await client.register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
    }
  });

  for (let i = 0; i < tests.length; i++) {
    console.log(`Change dir for test: '${tests[i]}' to '${testsDir[i]}'`);
    process.chdir(testsDir[i]);

    for (let iter = 1; iter <= iterLimit; iter++) {
      console.log(`Run Cypress test: '${tests[i]}' (current test: ${iter}/${iterLimit}, total tests: ${cypressTestsNumber})`);
      await callCypress(tests[i]);

      if (delayTimeout > 0) {
        console.log(`setTimeout for next Cypress call: ${delayTimeout}`);
        await delay(delayTimeout);
      }
    }
  }

  console.log(`Tests finished. Tests number: ${cypressTestsNumber}`);
  process.exit();
})();
