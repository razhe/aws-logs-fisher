const { contextBridge } = require('electron');

const ACCOUNT = '123456789012';
const REQUEST_ID = '7f3c2a91-5b4e-4d2a-9c11-2e8f6a0b4d37';

const SERVICES = [
  { name: 'notifications', status: 'ACTIVE', desired: 2, running: 2, pending: 0 },
  { name: 'orders-api', status: 'ACTIVE', desired: 3, running: 3, pending: 0 },
  { name: 'payments-worker', status: 'ACTIVE', desired: 2, running: 1, pending: 1 },
  { name: 'reports-batch', status: 'ACTIVE', desired: 0, running: 0, pending: 0 }
];

const at = (s) => `2026-11-19T14:02:${String(s).padStart(2, '0')}.${String(s * 37 % 1000).padStart(3, '0')}Z`;
const LOG_LINES = [
  `${at(1)} INFO Starting orders-api v2.14.0 on port 8080`,
  `${at(2)} INFO GET /api/orders/1842 200 18ms`,
  `${at(3)} DEBUG cache hit key=orders:1842 ttl=300s`,
  `${at(4)} INFO {"level":"info","msg":"order created","orderId":1843,"customerId":"c-4821","total":129.9,"currency":"USD","items":3}`,
  `${at(5)} INFO POST /api/orders 201 42ms`,
  `${at(6)} DEBUG db pool active=4 idle=6 waiting=0`,
  `${at(7)} INFO GET /api/orders/1843/items 200 9ms`,
  `${at(8)} WARN slow query took 1240ms on orders_by_customer`,
  `${at(9)} INFO POST /api/payments/charge 202 61ms`,
  `${at(12)}\t${REQUEST_ID}\tERROR\tTimeoutError: payment provider did not respond within 3000ms calling https://payments.example.internal/v2/charges`,
  '    at PaymentsClient.charge (/app/src/payments/client.js:88:11)',
  '    at async OrderService.checkout (/app/src/orders/service.js:142:7)',
  `${at(13)} WARN retrying charge for order 1843 (attempt 2 of 3)`,
  `${at(14)} INFO {"level":"info","msg":"payment captured","orderId":1843,"provider":"payments","attempt":2,"latencyMs":812}`,
  `${at(15)} INFO GET /health 200 2ms`,
  `${at(16)} INFO GET /api/orders?customer=c-4821&page=1 200 27ms`,
  `${at(17)} DEBUG feature flag checkout.v3 enabled for 25% of traffic`,
  `${at(18)} INFO PUT /api/orders/1843/status 200 15ms`,
  `${at(19)} INFO Order 1843 checkout summary: customer=c-4821 items=[sku-1001:qty=1:price=59.90,sku-2044:qty=2:price=24.95,sku-3107:qty=1:price=20.10] subtotal=129.90 tax=0.00 shipping=0.00 total=129.90 currency=USD coupon=none payment=card:visa:****4242 provider=payments attempt=2 warehouse=wh-scl-01 carrier=demo-express sla=48h fraudScore=0.03 channel=web`,
  `${at(21)} INFO {"level":"info","msg":"order shipped","orderId":1840,"carrier":"demo-express","eta":"2026-11-21"}`,
  `${at(23)}\t${REQUEST_ID}\tERROR\tValidationError: field "quantity" must be greater than 0`,
  '    at validateItem (/app/src/orders/validate.js:31:9)',
  `${at(24)} INFO POST /api/orders 400 6ms`,
  `${at(25)} INFO GET /api/orders/1844 200 14ms`,
  `${at(26)} DEBUG emitted event order.updated to queue orders-events`,
  `${at(27)} INFO {"level":"info","msg":"refund issued","orderId":1821,"amount":49.5,"reason":"customer_request"}`,
  `${at(28)} INFO GET /api/orders/1845 200 11ms`
];

const ok = (data) => Promise.resolve({ ok: true, data });
const listeners = {};

contextBridge.exposeInMainWorld('api', {
  listProfiles: () => ok(['default']),
  defaultRegion: () => ok('us-east-1'),
  authStatus: () => ok({ ok: true, account: ACCOUNT, arn: `arn:aws:sts::${ACCOUNT}:assumed-role/developer/demo` }),
  listRoles: () => ok([]),
  login: () => ok({}),
  cancelLogin: () => ok(),
  listClusters: () => ok(['demo-cluster']),
  listServices: () => ok(SERVICES),
  logTargets: (_ctx, _cluster, service) => ok([{ container: service, group: `/ecs/${service}`, prefix: `ecs/${service}`, region: '' }]),
  listLogGroups: () => ok([]),
  startLogs: (_ctx, id) => {
    setTimeout(() => listeners.data?.(id, LOG_LINES), 50);
    return ok();
  },
  stopLogs: () => ok(),
  startSearch: () => ok(),
  cancelSearch: () => ok(),
  onLogData: (cb) => { listeners.data = cb; },
  onLogEnd: () => {},
  onSearchPage: () => {},
  onSearchEnd: () => {}
});
