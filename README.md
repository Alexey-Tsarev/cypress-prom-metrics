# Expose Cypress test results as Prometheus metrics
This repository contains Cypress application, which runs end-2-end test and publish
results as Prometheus metrics.  
It also can send metrics to Prometheus Pushgateway.

Live demo:
```
export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1
docker-compose down
docker-compose build --progress=plain cypress-prom-metrics
docker-compose up
```

---
Good luck!  
Alexey Tsarev  
https://alexey-tsarev.github.io  
Tsarev.Alexey at gmail.com
