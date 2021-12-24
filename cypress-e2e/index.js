const cypress = require('cypress')
const express = require('express');
const client = require('prom-client');

// Default values
const listenPort = process.env.LISTEN_PORT || 8080;
const delayTimeout = parseInt(process.env.DELAY_TIMEOUT) || 0;
const iterLimit = parseInt(process.env.ITER_LIMIT) || false;
const pushGatewayUrl = process.env.PUSH_GATEWAY_URL || false;
const pushGatewayJobName = process.env.PUSH_GATEWAY_JOB_NAME || false;

if (process.env.CYPRESS_BASE_URL === undefined)
  process.env.CYPRESS_BASE_URL = "http://localhost"
// End Default values

const pushGateway = pushGatewayUrl !== false ? new client.Pushgateway(pushGatewayUrl) : false;
const server = express();
const Registry = client.Registry;
const register = new Registry();
const Counter = client.Counter;
const Gauge = client.Gauge;

const result = new Gauge({ name: 'result', help: 'result', labelNames: ['result'] });
const startedTestsAt = new Counter({ name: 'startedTestsAt', help: 'startedTestsAt', labelNames: ['startedTestsAt'] });
const endedTestsAt = new Counter({ name: 'endedTestsAt', help: 'endedTestsAt', labelNames: ['endedTestsAt'] });
const totalDuration = new Gauge({ name: 'totalDuration', help: 'totalDuration', labelNames: ['totalDuration'] });
const totalSuites = new Gauge({ name: 'totalSuites', help: 'totalSuites', labelNames: ['totalSuites'] });
const totalTests = new Gauge({ name: 'totalTests', help: 'totalTests', labelNames: ['totalTests'] });
const totalFailed = new Gauge({ name: 'totalFailed', help: 'totalFailed', labelNames: ['totalFailed'] });
const totalPassed = new Gauge({ name: 'totalPassed', help: 'totalPassed', labelNames: ['totalPassed'] });
const totalPending = new Gauge({ name: 'totalPending', help: 'totalPending', labelNames: ['totalPending'] });
const totalSkipped = new Gauge({ name: 'totalSkipped', help: 'totalSkipped', labelNames: ['totalSkipped'] });

let cypressArgs;
const getArgs = async () => {
  cypressArgs = await cypress.cli.parseRunArguments(process.argv.slice(2));
  console.log(`Command line arguments: ${process.argv}`);
  console.log(`Cypress args: ${JSON.stringify(cypressArgs)}`);
};

let iter = 1;
const callCypress = async () => {
  console.log(`Run Cypress (iteration: ${iter})`);
  let r = await cypress.run(cypressArgs);
  console.log("Cypress finished with results:");
  console.log(r);

  await setMetricsFromResult(r);

  if (pushGatewayUrl !== false) {
    console.log("Send data to PushGateway");

    await pushGateway
      .push({ jobName: pushGatewayJobName })
      .then(({ resp, body }) => {
        console.log(`PushGateway response status: ${resp.statusCode}`);
      })
      .catch(err => {
        console.log(`PushGateway error: ${err}`);
      });
  }

  if ((iterLimit === false) || (iterLimit > iter)) {
    iter++;
    console.log(`setTimeout for next Cypress call: ${delayTimeout}`);
    setTimeout(callCypress, delayTimeout);
  } else {
    console.log("Done!");
    process.exit();
  }
}

const setMetricsFromResult = async (r) => {
  switch (r.status) {
    case "finished":
      result.set(1);

      startedTestsAt.reset();
      startedTestsAt.inc(new Date(r.startedTestsAt).getTime());

      endedTestsAt.reset();
      endedTestsAt.inc(new Date(r.endedTestsAt).getTime());

      totalDuration.set(r.totalDuration);
      totalSuites.set(r.totalSuites);
      totalTests.set(r.totalTests);
      totalFailed.set(r.totalFailed);
      totalPassed.set(r.totalPassed);
      totalPending.set(r.totalPending);
      totalSkipped.set(r.totalSkipped);

      break;
    default:
      result.set(0);
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

(async () => {
  await getArgs();

  server.listen(listenPort);
  console.log(`Server is listening on port: ${listenPort}, metrics are exposed on /metrics endpoint`);

  server.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await client.register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
    }
  });

  await callCypress();
})();
