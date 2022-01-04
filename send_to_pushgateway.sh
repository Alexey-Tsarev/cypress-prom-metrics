#!/bin/sh

set -x

echo "test_metric 3.14" | \
curl --data-binary @- http://10.1.1.105:9091/metrics/job/app
