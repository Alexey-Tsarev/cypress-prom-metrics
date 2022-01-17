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
const cypressRunSpecSeparately = (String(process.env.CYPRESS_RUN_SPEC_SEPARATELY).toLowerCase() === "true");
const cypressSpecDir = process.env.CYPRESS_SPEC_DIR || path.join("cypress", "integration");
const cypressSpecFileName = process.env.CYPRESS_SPEC_FILE_NAME || false;
const cypressTestMetricsLabelName = process.env.CYPRESS_TEST_METRICS_LABEL_NAME || "test_name";

if (process.env.CYPRESS_BASE_URL === undefined)
  process.env.CYPRESS_BASE_URL = "http://localhost"
// End Default values

const pushGateway = pushGatewayUrl ? new client.Pushgateway(pushGatewayUrl) : false;
const server = express();
const Registry = client.Registry;
const register = new Registry();
const Gauge = client.Gauge;

if (metricsDefaultLabelName && metricsDefaultLabelValue)
  client.register.setDefaultLabels({ [metricsDefaultLabelName]: metricsDefaultLabelValue });

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
const setCypressArgs = async (spec = false) => {
  let args = process.argv.slice(2);

  if (spec) {
    args.push("--spec");
    args.push(path.join(cypressSpecDir, spec));
  }

  cypressArgs = await cypress.cli.parseRunArguments(args);
  console.log(`Cypress args: ${JSON.stringify(cypressArgs)}`);
};

let specs = [];
let specsName = [];
const getSpecs = async () => {
  let testsNumber = 1;
  console.log("Spec files list:");
  fs.readdirSync(cypressSpecDir).forEach(file => {
    if ((cypressSpecFileName === false) || (cypressSpecFileName && (file === cypressSpecFileName))) {
      specs.push(file)

      let sName = file.substr(0, file.indexOf("."));
      specsName.push(sName);

      console.log(`${testsNumber}. ${file} (${sName})`);
      testsNumber++;
    }
  });
  console.log("End of list");
};

let cypressTestsNumber = 0;
const runCypress = async (spec_name = false, test_name = "") => {
  let r = await cypress.run(cypressArgs);
  console.log("Cypress finished with results:");
  console.log(r);

  await setMetricsFromResult(r, test_name);

  if (pushGatewayUrl) {
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
  console.log(`Command line arguments: ${process.argv}`);

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

  let specsLen;
  if (cypressRunSpecSeparately || cypressSpecFileName) {
    await getSpecs();
    specsLen = specs.length;
  } else
    specsLen = 1;

  for (let i = 0; i < specsLen; i++) {
    for (let iter = 1; iter <= iterLimit; iter++) {
      console.log(`Current test: ${iter}/${iterLimit}, completed tests: ${cypressTestsNumber}`);

      if (cypressRunSpecSeparately || cypressSpecFileName) {
        console.log(`Run Cypress, use '${specs[i]}' spec file`);
        await setCypressArgs(specs[i]);
        await runCypress(specs[i], specsName[i]);
      } else {
        console.log("Run Cypress");
        await setCypressArgs();
        await runCypress();
      }

      if (delayTimeout > 0) {
        console.log(`setTimeout for next Cypress call: ${delayTimeout}`);
        await delay(delayTimeout);
      }
    }
  }

  console.log(`Done. Tests finished number: ${cypressTestsNumber}`);
  process.exit();
})();
