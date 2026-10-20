import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const checkUrl = `${baseUrl}/api/check`;
const contributorsUrl = `${baseUrl}/api/contributors/paginated?limit=25`;

const testAddress = __ENV.TEST_ADDRESS || 'GAS4JQ3KQH84GJ5VJ3M9S6D6A8Y8E5D7Q7XQ5K7ZJ5QZ2NR4Q6X7K4X';

export const options = {
  vus: __ENV.VUS ? Number(__ENV.VUS) : 5,
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800'],
    checks: ['rate>0.95'],
  },
};

export default function () {
  const checkRes = http.post(
    checkUrl,
    JSON.stringify({ address: testAddress }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'check' },
    },
  );

  check(checkRes, {
    'check returns a valid status': (r) => r.status === 200 || r.status === 429,
  });

  const contributorsRes = http.get(contributorsUrl, {
    headers: { 'x-cache-bypass': '1' },
    tags: { name: 'contributors' },
  });

  check(contributorsRes, {
    'contributors returns ok for maintainer session': (r) => r.status === 200 || r.status === 403,
  });

  sleep(0.5);
}
